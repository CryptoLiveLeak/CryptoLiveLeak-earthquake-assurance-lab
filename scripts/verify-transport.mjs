import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { JSONCodec } from "nats";
import { connectToLab, ensureLabJetStream } from "../services/nats-client.mjs";

const connection = await connectToLab("earthquake-lab-transport-verifier");
const jetstream = await ensureLabJetStream(connection);
const manager = await connection.jetstreamManager();
const codec = JSONCodec();
const proofId = `transport-proof-${Date.now()}`;

const first = await jetstream.publish(
  "lab.integration.dedupe",
  new TextEncoder().encode("dedupe-probe"),
  { msgID: proofId },
);
const second = await jetstream.publish(
  "lab.integration.dedupe",
  new TextEncoder().encode("dedupe-probe"),
  { msgID: proofId },
);

const stream = await manager.streams.info("LAB");
const decisionConsumer = await manager.consumers.info("LAB", "decision-worker-v1");
const aggregatorConsumer = await manager.consumers.info("LAB", "aggregator-v1");
const alertMessage = await manager.streams.getMessage("LAB", {
  last_by_subj: "lab.alerts.simulated",
});
const simulatedAlert = codec.decode(alertMessage.data);

const consumers = [decisionConsumer, aggregatorConsumer].map((consumer) => ({
  name: consumer.name,
  ackPolicy: consumer.config.ack_policy,
  ackWaitNanos: consumer.config.ack_wait,
  maxDeliver: consumer.config.max_deliver,
  maxAckPending: consumer.config.max_ack_pending,
  deliveredStreamSequence: consumer.delivered.stream_seq,
  acknowledgedStreamSequence: consumer.ack_floor.stream_seq,
}));

const checks = {
  streamBounded: stream.config.max_msgs === 100_000 && stream.config.max_bytes === 512 * 1024 * 1024,
  durableConsumers: consumers.length === 2 && consumers.every((consumer) => consumer.ackPolicy === "explicit"),
  boundedRedelivery: consumers.every((consumer) => consumer.maxDeliver === 3 && consumer.maxAckPending === 64),
  deterministicDeduplication: first.duplicate === false && second.duplicate === true,
  simulatedAlertPublished: simulatedAlert.simulationOnly === true && simulatedAlert.candidate === true,
};

if (Object.values(checks).some((passed) => !passed)) {
  throw new Error(`Transport verification failed: ${JSON.stringify(checks)}`);
}

const evidence = {
  generatedAt: new Date().toISOString(),
  stream: {
    name: stream.config.name,
    subjects: stream.config.subjects,
    storedMessages: stream.state.messages,
    maxMessages: stream.config.max_msgs,
    maxBytes: stream.config.max_bytes,
    duplicateWindowNanos: stream.config.duplicate_window,
  },
  consumers,
  deduplication: {
    firstDuplicate: first.duplicate,
    secondDuplicate: second.duplicate,
    stream: first.stream,
    sequence: first.seq,
  },
  simulatedAlert,
  checks,
};
evidence.evidenceHash = createHash("sha256")
  .update(JSON.stringify(evidence))
  .digest("hex");

writeFileSync(
  path.resolve("public/data/transport-evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
await connection.drain();
console.log(JSON.stringify({ checks, evidenceHash: evidence.evidenceHash }));
