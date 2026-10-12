// Fault-injection integration suite against a real NATS JetStream server.
// Starts the worker and aggregator as child processes, injects adverse conditions, and
// writes public/data/integration-evidence.json. Requires an empty server at NATS_URL.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { codec, connectToLab, ensureLabJetStream, MAX_DELIVER, STREAM } from "../services/nats-client.mjs";
import { eventKeyFor, normalizeFeature } from "../services/lib/event-contract.mjs";
import { provenance } from "./provenance.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const processes = new Map();
const logs = [];

function start(name, script) {
  const child = spawn(process.execPath, [script], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const lines = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => chunk.split("\n").filter(Boolean).forEach((line) => { lines.push(line); logs.push(`${name}: ${line}`); }));
  }
  child.on("exit", (code, signal) => logs.push(`${name}: exited code=${code} signal=${signal}`));
  processes.set(name, { child, lines });
  return processes.get(name);
}
async function startReady(name, script) {
  const p = start(name, script);
  await waitFor(() => p.lines.some((l) => l.includes('"state":"ready"')), 10_000, `${name} ready`);
  return p;
}
async function stop(name) {
  const p = processes.get(name);
  if (!p) return;
  if (p.child.exitCode === null && p.child.signalCode === null) {
    const exited = new Promise((resolve) => p.child.once("exit", resolve));
    p.child.kill("SIGTERM");
    await Promise.race([exited, sleep(5_000).then(() => p.child.kill("SIGKILL"))]);
  }
  processes.delete(name);
}
async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const connection = await connectToLab("earthquake-lab-integration-verifier");
const jetstream = await ensureLabJetStream(connection);
const manager = await connection.jetstreamManager();

async function messages(subjectPrefix) {
  const info = await manager.streams.info(STREAM);
  const out = [];
  for (let seq = info.state.first_seq; seq <= info.state.last_seq; seq += 1) {
    try {
      const m = await manager.streams.getMessage(STREAM, { seq });
      if (m.subject.startsWith(subjectPrefix)) out.push({ subject: m.subject, data: codec.decode(m.data) });
    } catch { /* deleted or gap */ }
  }
  return out;
}
const alertsFor = async (eventId) => (await messages("lab.alerts.simulated")).filter((m) => m.data.eventId === eventId);
const decisionsFor = async (eventId) => (await messages("lab.decisions")).filter((m) => m.data.eventId === eventId);
const deadLetters = async () => messages("lab.deadletter.");

function event(id, { magnitude = 5.6, ageMs = 2_000, revision = Date.now(), depthKm = 10 } = {}) {
  const now = Date.now();
  const result = normalizeFeature({
    id,
    properties: { mag: magnitude, time: now - ageMs, updated: revision, status: "reviewed" },
    geometry: { coordinates: [-122.1, 37.4, depthKm] },
  }, { source: "Synthetic assurance fixture" });
  if (!result.ok) throw new Error(`fixture ${id} invalid: ${result.reason}`);
  return result.event;
}
const publishEvent = (e) => jetstream.publish("lab.events.normalized", codec.encode(e), { msgID: `event:${e.eventKey}` });
const publishDecision = (d, msgID) => jetstream.publish("lab.decisions", codec.encode({ schemaVersion: 1, decidedAt: new Date().toISOString(), ...d }), { msgID });

const scenarios = [];
async function scenario(name, finding, description, body) {
  const started = Date.now();
  try {
    const observed = await body();
    scenarios.push({ name, finding, description, passed: true, observed, durationMs: Date.now() - started });
  } catch (error) {
    scenarios.push({ name, finding, description, passed: false, observed: error.message, durationMs: Date.now() - started });
  }
}

await startReady("worker-a", "services/decision-worker.mjs");
await startReady("aggregator", "services/aggregator.mjs");

await scenario("end_to_end_candidate", null, "A valid candidate event flows ingest -> C++ decision -> aggregator -> simulated alert.", async () => {
  const e = event("it-e2e");
  await publishEvent(e);
  await waitFor(async () => (await alertsFor("it-e2e")).length === 1, 10_000, "alert");
  const [alert] = await alertsFor("it-e2e");
  if (alert.data.simulationOnly !== true || alert.data.reason !== "test_threshold_met") throw new Error("unexpected alert content");
  return { alerts: 1, reason: alert.data.reason, simulationOnly: true };
});

await scenario("fail_closed_ingestion", "CLL-001", "Features with null magnitude, null depth, or no event time are rejected at ingestion instead of being coerced.", async () => {
  const now = Date.now();
  const base = { id: "it-bad", geometry: { coordinates: [-122.1, 37.4, 10] }, properties: { mag: 5.6, time: now, status: "reviewed" } };
  const reasons = [
    normalizeFeature({ ...base, properties: { ...base.properties, mag: null } }).reason,
    normalizeFeature({ ...base, geometry: { coordinates: [-122.1, 37.4, null] } }).reason,
    normalizeFeature({ ...base, properties: { mag: 5.6, status: "reviewed" } }).reason,
  ];
  if (reasons.join() !== "missing_magnitude,missing_depth,missing_event_time") throw new Error(reasons.join());
  return { rejected: reasons };
});

await scenario("invalid_event_dead_lettered", "CLL-001", "An event that bypasses the ingestor with a null depth is dead-lettered by the worker and never decided.", async () => {
  const e = { ...event("it-invalid"), depthKm: null };
  await jetstream.publish("lab.events.normalized", codec.encode(e), { msgID: "it-invalid" });
  await waitFor(async () => (await deadLetters()).some((m) => m.data.reason === "invalid_event" && m.data.detail === "invalid_depthKm"), 10_000, "dead letter");
  await sleep(500);
  if ((await decisionsFor("it-invalid")).length) throw new Error("invalid event was decided");
  return { deadLetterReason: "invalid_event", detail: "invalid_depthKm", decisions: 0 };
});

await scenario("poison_message_bounded_redelivery", "CLL-004", `An undecodable message is retried exactly ${MAX_DELIVER} times, then dead-lettered (previously dropped silently).`, async () => {
  const ack = await jetstream.publish("lab.events.normalized", new TextEncoder().encode("{not json"), { msgID: "it-poison" });
  await waitFor(async () => (await deadLetters()).some((m) => m.data.streamSequence === ack.seq), 20_000, "poison dead letter");
  const record = (await deadLetters()).find((m) => m.data.streamSequence === ack.seq).data;
  if (record.reason !== "max_deliveries_exhausted" || record.deliveryCount !== MAX_DELIVER) throw new Error(JSON.stringify(record));
  const attempts = processes.get("worker-a").lines.filter((l) => l.includes('"processing_error"') && l.includes(`"seq":${ack.seq}`)).length;
  if (attempts !== MAX_DELIVER) throw new Error(`observed ${attempts} attempts`);
  return { attempts, deadLetterReason: record.reason, payloadPreserved: Buffer.from(record.payloadBase64, "base64").toString() === "{not json" };
});

await scenario("revision_zero_replay", "CLL-002", "A revision-0 decision replayed with a new message ID (as after the dedupe window) yields one alert, not two.", async () => {
  const d = { eventId: "it-rev0", eventKey: eventKeyFor("it-rev0", 0), sourceRevision: 0, candidate: true, reason: "test_threshold_met", score: 5 };
  await publishDecision(d, "it-rev0-a");
  await waitFor(async () => (await alertsFor("it-rev0")).length === 1, 10_000, "first alert");
  await publishDecision({ ...d, eventKey: "replayed-key" }, "it-rev0-b");
  await sleep(1_500);
  const alerts = (await alertsFor("it-rev0")).length;
  if (alerts !== 1) throw new Error(`${alerts} simulated alerts for one event revision`);
  return { alerts, secondDelivery: "duplicate_revision" };
});

await scenario("out_of_order_revision", null, "An older revision arriving after a newer one is suppressed.", async () => {
  const mk = (rev) => ({ eventId: "it-order", eventKey: eventKeyFor("it-order", rev), sourceRevision: rev, candidate: true, reason: "test_threshold_met", score: 5 });
  await publishDecision(mk(10), "it-order-10");
  await waitFor(async () => (await alertsFor("it-order")).length === 1, 10_000, "rev 10 alert");
  await publishDecision(mk(9), "it-order-9");
  await sleep(1_500);
  const alerts = await alertsFor("it-order");
  if (alerts.length !== 1 || alerts[0].data.sourceRevision !== 10) throw new Error("wrong alerts");
  return { alerts: 1, keptRevision: 10, rejected: "out_of_order_revision" };
});

await scenario("future_timestamp_rejected", "CLL-001", "An event timestamped 60 s in the future is rejected as out of range instead of clamped to zero age.", async () => {
  const e = event("it-future", { ageMs: -60_000 });
  await publishEvent(e);
  await waitFor(async () => (await decisionsFor("it-future")).length === 1, 10_000, "decision");
  const [d] = await decisionsFor("it-future");
  if (d.data.reason !== "input_out_of_range" || d.data.candidate) throw new Error(d.data.reason);
  return { reason: d.data.reason };
});

await scenario("worker_restart_resumes", null, "With the worker stopped (graceful drain), a published event waits in the durable consumer and is processed after restart.", async () => {
  await stop("worker-a");
  const e = event("it-restart");
  await publishEvent(e);
  await sleep(1_000);
  if ((await decisionsFor("it-restart")).length) throw new Error("decided while worker stopped");
  await startReady("worker-a", "services/decision-worker.mjs");
  await waitFor(async () => (await alertsFor("it-restart")).length === 1, 15_000, "alert after restart");
  return { decidedWhileStopped: 0, alertsAfterRestart: 1 };
});

await scenario("queue_group_scale_out", "CLL-005", "Two worker replicas share one durable consumer and each of 20 events is decided exactly once (previously a second replica crashed at startup with \"duplicate subscription\").", async () => {
  await startReady("worker-b", "services/decision-worker.mjs");
  await sleep(500);
  const ids = Array.from({ length: 20 }, (_, i) => `it-scale-${i}`);
  for (const id of ids) await publishEvent(event(id));
  await waitFor(async () => {
    const decided = (await messages("lab.decisions")).filter((m) => m.data.eventId.startsWith("it-scale-"));
    return decided.length === ids.length;
  }, 15_000, "decisions");
  await sleep(1_000);
  const count = (name) => processes.get(name).lines.filter((l) => l.includes('"decided"') && l.includes("it-scale-")).length;
  const a = count("worker-a"); const b = count("worker-b");
  if (a + b !== ids.length) throw new Error(`engine executions ${a}+${b} != ${ids.length}`);
  return { events: ids.length, executionsWorkerA: a, executionsWorkerB: b };
});

for (const name of [...processes.keys()]) await stop(name);
const stream = await manager.streams.info(STREAM);
const natsVersion = connection.info?.version ?? null;
await connection.drain();

const source = provenance();
const stable = scenarios.map(({ durationMs, observed, ...rest }) => rest);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  release: source.commit,
  provenance: { commit: source.commit, workingTreeDirty: source.workingTreeDirty, sourceSha256: source.sourceSha256, digitallySigned: false },
  scope: "Fault-injection integration run against a single local NATS JetStream server. Not a load, latency, or availability test.",
  natsServer: natsVersion,
  scenarios,
  stream: { messages: stream.state.messages },
  summary: {
    total: scenarios.length,
    passed: scenarios.filter((s) => s.passed).length,
    failed: scenarios.filter((s) => !s.passed).length,
    evidenceHash: createHash("sha256").update(JSON.stringify(stable)).digest("hex"),
  },
};
writeFileSync(path.resolve("public/data/integration-evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
for (const s of scenarios) console.log(`${s.passed ? "PASS" : "FAIL"} ${s.name}${s.passed ? "" : ` :: ${s.observed}`}`);
if (report.summary.failed) {
  console.log(logs.slice(-40).join("\n"));
  process.exitCode = 1;
}
