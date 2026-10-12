import { codec, connectToLab, durableConsumerOptions, ensureLabJetStream } from "./nats-client.mjs";
import { validateDecision } from "./lib/event-contract.mjs";
import { deadLetter, drainOnSignal, handleFailure, log } from "./lib/failure-handling.mjs";
import { RevisionGate } from "./lib/revision-gate.mjs";

const SERVICE = "aggregator-v1";
const connection = await connectToLab(`earthquake-lab-${SERVICE}`);
const jetstream = await ensureLabJetStream(connection);
const subscription = await jetstream.subscribe("lab.decisions", durableConsumerOptions(SERVICE));
const gate = new RevisionGate(Number(process.env.REVISION_CAPACITY || 10_000));
drainOnSignal(connection, SERVICE);
log({ service: SERVICE, state: "ready", subject: "lab.decisions", revisionCapacity: gate.capacity });

for await (const message of subscription) {
  try {
    const decision = codec.decode(message.data);
    const invalid = validateDecision(decision);
    if (invalid) {
      await deadLetter(jetstream, codec, SERVICE, message, "invalid_decision", invalid);
      message.term(invalid);
      log({ service: SERVICE, state: "dead_lettered", reason: "invalid_decision", detail: invalid });
      continue;
    }

    const verdict = gate.check(decision.eventId, decision.sourceRevision);
    if (verdict !== "accepted") {
      message.ack();
      log({ service: SERVICE, state: "suppressed", eventId: decision.eventId, reason: verdict });
      continue;
    }

    if (decision.candidate) {
      await jetstream.publish("lab.alerts.simulated", codec.encode({
        ...decision,
        simulationOnly: true,
        publishedAt: new Date().toISOString(),
      }), { msgID: `simulated-alert:${decision.eventKey}` });
    }
    // Commit only after publication succeeded (FINDING CLL-003: committing first meant a
    // failed publish was redelivered, judged a duplicate, acknowledged, and lost).
    gate.commit(decision.eventId, decision.sourceRevision);
    message.ack();
    log({ service: SERVICE, state: decision.candidate ? "simulated_alert" : "recorded", eventId: decision.eventId, revision: decision.sourceRevision });
  } catch (error) {
    const action = await handleFailure(jetstream, codec, SERVICE, message, error);
    log({ service: SERVICE, state: "processing_error", action, error: error.message, delivery: message.info.deliveryCount });
  }
}
