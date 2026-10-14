import {
  connect,
  consumerOpts,
  DiscardPolicy,
  JSONCodec,
  RetentionPolicy,
  StorageType,
} from "nats";

export const codec = JSONCodec();
export const STREAM = "LAB";
export const MAX_DELIVER = 3;
export const ACK_WAIT_MS = 5_000;
export const MAX_ACK_PENDING = 64;

export const STREAM_CONFIG = Object.freeze({
  name: STREAM,
  description: "Bounded persistence for earthquake assurance lab evidence",
  subjects: ["lab.>"],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  discard: DiscardPolicy.Old,
  max_msgs: 100_000,
  max_bytes: 512 * 1024 * 1024,
  max_age: 24 * 60 * 60 * 1_000_000_000,
  duplicate_window: 2 * 60 * 1_000_000_000,
  num_replicas: 1,
});

// Limits that must match; drift is corrected rather than silently ignored (FINDING CLL-008).
const ENFORCED_LIMITS = ["max_msgs", "max_bytes", "max_age", "duplicate_window", "discard"];

/** Connect to the lab broker (NATS_URL, default loopback) with bounded reconnect attempts. */
export async function connectToLab(name) {
  const servers = process.env.NATS_URL || "nats://127.0.0.1:4222";
  return connect({
    servers,
    name,
    maxReconnectAttempts: 10,
    reconnectTimeWait: 500,
    timeout: 3000,
  });
}

/** Ensure the bounded LAB stream exists with the enforced limits, correcting drift, and return a JetStream client. */
export async function ensureLabJetStream(connection) {
  const manager = await connection.jetstreamManager();
  let info = null;
  try {
    info = await manager.streams.info(STREAM);
  } catch {
    try {
      info = await manager.streams.add({ ...STREAM_CONFIG });
    } catch {
      info = await manager.streams.info(STREAM); // created concurrently by another service
    }
  }

  const drift = ENFORCED_LIMITS.filter((key) => info.config[key] !== STREAM_CONFIG[key]);
  if (drift.length) {
    console.warn(JSON.stringify({ state: "stream_config_drift", fields: drift }));
    await manager.streams.update(STREAM, { ...info.config, ...Object.fromEntries(drift.map((key) => [key, STREAM_CONFIG[key]])) });
  }
  return connection.jetstream();
}

/**
 * Durable push consumer bound to a queue group, so several replicas of a service share
 * the work instead of each receiving every message (FINDING CLL-005).
 */
export function durableConsumerOptions(name) {
  const options = consumerOpts();
  options.durable(name);
  options.deliverTo(`_lab.delivery.${name}`);
  options.queue(name);
  options.bindStream(STREAM);
  options.deliverAll();
  options.replayInstantly();
  options.manualAck();
  options.ackExplicit();
  options.ackWait(ACK_WAIT_MS);
  options.maxDeliver(MAX_DELIVER);
  options.maxAckPending(MAX_ACK_PENDING);
  return options;
}
