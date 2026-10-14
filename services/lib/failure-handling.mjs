// FINDING CLL-004: after maxDeliver attempts, JetStream stops redelivering and the message
// was silently lost. Each consumer now writes a dead-letter record on its final attempt and
// terminates the message, so every failure is observable and replayable from the stream.
import { MAX_DELIVER } from "../nats-client.mjs";

export const DEAD_LETTER_PREFIX = "lab.deadletter";
export const RETRY_DELAY_MS = 1_000;

/** Subject that holds a consumer's dead-letter records. */
export function deadLetterSubject(consumer) {
  return `${DEAD_LETTER_PREFIX}.${consumer}`;
}

/** Publish a dead-letter record. msgID makes repeated attempts idempotent. */
export async function deadLetter(jetstream, codec, consumer, message, reason, detail = "") {
  const record = {
    schemaVersion: 1,
    consumer,
    reason,
    detail: String(detail).slice(0, 500),
    originalSubject: message.subject,
    streamSequence: message.info?.streamSequence ?? null,
    deliveryCount: message.info?.deliveryCount ?? null,
    deadLetteredAt: new Date().toISOString(),
    payloadBase64: Buffer.from(message.data).toString("base64"),
  };
  await jetstream.publish(deadLetterSubject(consumer), codec.encode(record), {
    msgID: `deadletter:${consumer}:${record.streamSequence}`,
  });
  return record;
}

/**
 * Handle a processing failure: retry with delay until the final delivery, then dead-letter
 * and terminate. Returns the action taken, for logging and tests.
 */
export async function handleFailure(jetstream, codec, consumer, message, error, maxDeliver = MAX_DELIVER) {
  const attempt = message.info?.deliveryCount ?? 1;
  if (attempt < maxDeliver) {
    message.nak(RETRY_DELAY_MS);
    return "retry";
  }
  try {
    await deadLetter(jetstream, codec, consumer, message, "max_deliveries_exhausted", error?.message ?? error);
    message.term("dead-lettered");
    return "dead_lettered";
  } catch {
    // If the dead-letter publish itself fails, leave the message unacknowledged so the
    // broker's ack-wait expiry, not this process, decides; nothing is silently acked.
    return "dead_letter_failed";
  }
}

/** Log one structured line. */
export function log(record) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...record }));
}

/** Drain on SIGTERM/SIGINT so in-flight messages are acked or returned (FINDING CLL-007). */
export function drainOnSignal(connection, name) {
  let draining = false;
  // Drain once, on the first signal; later signals are ignored while draining.
  const stop = async (signal) => {
    if (draining) return;
    draining = true;
    log({ service: name, state: "draining", signal });
    try { await connection.drain(); } finally { process.exit(0); }
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
