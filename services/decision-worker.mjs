import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { codec, connectToLab, durableConsumerOptions, ensureLabJetStream } from "./nats-client.mjs";
import { validateEvent } from "./lib/event-contract.mjs";
import { deadLetter, drainOnSignal, handleFailure, log } from "./lib/failure-handling.mjs";

const run = promisify(execFile);
const SERVICE = "decision-worker-v1";
const ENGINE_TIMEOUT_MS = 1_000;
const engine = process.env.DECISION_ENGINE || path.resolve("build/alert_decision");

/**
 * Run the C++ engine without blocking the event loop (FINDING CLL-009: spawnSync stalled
 * acknowledgements and heartbeats for every in-flight message while one engine call ran).
 */
async function decide(event, now = Date.now()) {
  // No clamping: a future observedAt yields a negative age, which the engine rejects as
  // input_out_of_range instead of being treated as a perfectly fresh event (FINDING CLL-001).
  const ageMs = now - Date.parse(event.observedAt);
  try {
    const { stdout } = await run(engine, [
      event.magnitude, event.quality, ageMs, event.latitude, event.longitude, event.depthKm,
    ].map(String), { timeout: ENGINE_TIMEOUT_MS, maxBuffer: 4096 });
    const parsed = JSON.parse(stdout);
    if (typeof parsed.candidate !== "boolean" || typeof parsed.reason !== "string") throw new Error("engine output contract violated");
    return parsed;
  } catch (error) {
    return { candidate: false, reason: "engine_failure", score: 0, detail: String(error.code ?? error.message).slice(0, 120) };
  }
}

const connection = await connectToLab(`earthquake-lab-${SERVICE}`);
const jetstream = await ensureLabJetStream(connection);
const subscription = await jetstream.subscribe("lab.events.normalized", durableConsumerOptions(SERVICE));
drainOnSignal(connection, SERVICE);
log({ service: SERVICE, state: "ready", subject: "lab.events.normalized", engine });

for await (const message of subscription) {
  try {
    const event = codec.decode(message.data);
    const invalid = validateEvent(event);
    if (invalid) {
      // A contract violation will not succeed on retry: dead-letter it immediately.
      await deadLetter(jetstream, codec, SERVICE, message, "invalid_event", invalid);
      message.term(invalid);
      log({ service: SERVICE, state: "dead_lettered", reason: "invalid_event", detail: invalid, seq: message.info.streamSequence });
      continue;
    }
    const decision = await decide(event);
    await jetstream.publish("lab.decisions", codec.encode({
      schemaVersion: 1,
      eventId: event.eventId,
      eventKey: event.eventKey,
      sourceRevision: event.sourceRevision,
      decidedAt: new Date().toISOString(),
      ...decision,
    }), { msgID: `decision:${event.eventKey}` });
    message.ack();
    log({ service: SERVICE, state: "decided", eventId: event.eventId, reason: decision.reason });
  } catch (error) {
    const action = await handleFailure(jetstream, codec, SERVICE, message, error);
    log({ service: SERVICE, state: "processing_error", action, error: error.message, seq: message.info.streamSequence, delivery: message.info.deliveryCount });
  }
}
