// Event contract for lab.events.normalized and lab.decisions.
// Fail closed: a field that is missing, null, a string, or non-finite is rejected.
// It is never coerced to zero and never replaced with a fabricated value (FINDING CLL-001).
import { createHash } from "node:crypto";

export const SCHEMA_VERSION = 1;
export const MAX_ID_LENGTH = 200;
// Revisions are USGS millisecond timestamps (or positive integers for fixtures).
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isRevision = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * Normalize one USGS GeoJSON feature.
 * @returns {{ ok: true, event: object } | { ok: false, reason: string, eventId: string }}
 */
export function normalizeFeature(feature, { source = "USGS public GeoJSON feed", receivedAt = Date.now() } = {}) {
  const properties = feature?.properties ?? {};
  const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  const eventId = typeof feature?.id === "string" ? feature.id : "";
  const reject = (reason) => ({ ok: false, reason, eventId: eventId.slice(0, MAX_ID_LENGTH) });

  if (!eventId || eventId.length > MAX_ID_LENGTH) return reject("invalid_event_id");
  if (!isFiniteNumber(properties.time)) return reject("missing_event_time");
  if (!isFiniteNumber(properties.mag)) return reject("missing_magnitude");
  const [longitude, latitude, depthKm] = coordinates;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return reject("missing_coordinates");
  if (!isFiniteNumber(depthKm)) return reject("missing_depth");

  const sourceRevision = properties.updated ?? properties.time;
  if (!isRevision(sourceRevision)) return reject("invalid_revision");

  const event = {
    schemaVersion: SCHEMA_VERSION,
    eventId,
    sourceRevision,
    observedAt: new Date(properties.time).toISOString(),
    receivedAt: new Date(receivedAt).toISOString(),
    magnitude: properties.mag,
    latitude,
    longitude,
    depthKm,
    // Illustrative input only; not a USGS uncertainty or confidence measure.
    quality: properties.status === "reviewed" ? 0.95 : 0.75,
    source,
  };
  event.eventKey = eventKeyFor(eventId, sourceRevision);
  return { ok: true, event };
}

export function eventKeyFor(eventId, sourceRevision) {
  return createHash("sha256").update(`${eventId}:${sourceRevision}`).digest("hex");
}

/** Validate a decoded lab.events.normalized message before it reaches the engine. */
export function validateEvent(event) {
  if (event === null || typeof event !== "object") return "not_an_object";
  if (event.schemaVersion !== SCHEMA_VERSION) return "unsupported_schema_version";
  if (typeof event.eventId !== "string" || !event.eventId || event.eventId.length > MAX_ID_LENGTH) return "invalid_event_id";
  if (!isRevision(event.sourceRevision)) return "invalid_revision";
  if (typeof event.eventKey !== "string" || event.eventKey !== eventKeyFor(event.eventId, event.sourceRevision)) return "invalid_event_key";
  if (typeof event.observedAt !== "string" || !Number.isFinite(Date.parse(event.observedAt))) return "invalid_observed_at";
  for (const field of ["magnitude", "quality", "latitude", "longitude", "depthKm"]) {
    if (!isFiniteNumber(event[field])) return `invalid_${field}`;
  }
  return null;
}

/** Validate a decoded lab.decisions message before aggregation. */
export function validateDecision(decision) {
  if (decision === null || typeof decision !== "object") return "not_an_object";
  if (typeof decision.eventId !== "string" || !decision.eventId || decision.eventId.length > MAX_ID_LENGTH) return "invalid_event_id";
  if (!isRevision(decision.sourceRevision)) return "invalid_revision";
  if (typeof decision.eventKey !== "string" || !decision.eventKey) return "invalid_event_key";
  if (typeof decision.candidate !== "boolean") return "invalid_candidate";
  if (typeof decision.reason !== "string") return "invalid_reason";
  return null;
}
