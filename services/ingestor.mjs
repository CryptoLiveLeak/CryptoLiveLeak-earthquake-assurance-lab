import { codec, connectToLab, ensureLabJetStream } from "./nats-client.mjs";
import { normalizeFeature } from "./lib/event-contract.mjs";
import { log } from "./lib/failure-handling.mjs";

const FEED_URL = process.env.USGS_FEED_URL ||
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
const synthetic = process.env.SYNTHETIC_ONLY !== "0"; // synthetic is the default; catalog is opt-in

function syntheticPayload() {
  const now = Date.now();
  return {
    metadata: { generated: now },
    features: [
      {
        id: "synthetic-candidate-001",
        properties: { mag: 5.4, time: now - 5_000, updated: now, status: "reviewed" },
        geometry: { coordinates: [-122.3, 37.8, 12.0] },
      },
      {
        id: "synthetic-suppressed-001",
        properties: { mag: 2.1, time: now - 8_000, updated: now + 1, status: "reviewed" },
        geometry: { coordinates: [-118.2, 34.1, 8.0] },
      },
    ],
  };
}

let payload;
if (synthetic) {
  payload = syntheticPayload();
} else {
  const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`USGS feed returned HTTP ${response.status}`);
  payload = await response.json();
}

const connection = await connectToLab("earthquake-lab-ingestor");
const jetstream = await ensureLabJetStream(connection);
const source = synthetic ? "Synthetic assurance fixture" : "USGS public GeoJSON feed";
const rejected = {};
let published = 0;

for (const feature of Array.isArray(payload?.features) ? payload.features : []) {
  // One malformed feature is rejected and counted; it no longer aborts the batch.
  const result = normalizeFeature(feature, { source });
  if (!result.ok) {
    rejected[result.reason] = (rejected[result.reason] || 0) + 1;
    log({ service: "ingestor", state: "rejected", eventId: result.eventId, reason: result.reason });
    continue;
  }
  await jetstream.publish("lab.events.normalized", codec.encode(result.event), {
    msgID: `event:${result.event.eventKey}`,
  });
  published += 1;
}

const settleMs = Number(process.env.INGEST_SETTLE_MS || 1_500);
await new Promise((resolve) => setTimeout(resolve, settleMs));
await connection.drain();
log({ service: "ingestor", state: "complete", published, rejected, source: synthetic ? "synthetic" : FEED_URL });
