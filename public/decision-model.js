// Demonstration policy, not a scientific model or public-warning algorithm.
export function decisionFor(event, now = Date.now()) {
  const age = now - event.observedAt;
  if (![event.magnitude, event.quality, event.observedAt, now, event.latitude, event.longitude, event.depthKm].every(Number.isFinite)) {
    return { candidate: false, reason: "malformed_input", score: 0 };
  }
  if (event.magnitude < -2 || event.magnitude > 10 || event.quality < 0 || event.quality > 1 ||
      age < 0 || age > 3600000 || event.latitude < -90 || event.latitude > 90 ||
      event.longitude < -180 || event.longitude > 180 || event.depthKm < -5 || event.depthKm > 800) {
    return { candidate: false, reason: "input_out_of_range", score: 0 };
  }
  if (age > 120000) return { candidate: false, reason: "stale_event", score: 0 };
  if (event.quality < 0.65) return { candidate: false, reason: "insufficient_quality", score: event.magnitude * event.quality };
  const score = event.magnitude * event.quality * Math.max(0, 1 - age / 120000);
  const candidate = event.magnitude >= 4.5 && score >= 3.2;
  return { candidate, reason: candidate ? "test_threshold_met" : "below_test_threshold", score };
}

export class RevisionGate {
  constructor(limit = 256) { this.limit = limit; this.revisions = new Map(); }
  check(id, revision) {
    if (typeof id !== "string" || !id || id.length > 200 || !Number.isSafeInteger(revision) || revision < 0) return "invalid_revision";
    const known = this.revisions.get(id);
    if (known !== undefined && revision <= known) return revision === known ? "duplicate_revision" : "out_of_order_revision";
    if (known === undefined && this.revisions.size >= this.limit) return "capacity_reached";
    return "accepted";
  }
  commit(id, revision) {
    const reason = this.check(id, revision);
    if (reason === "accepted") this.revisions.set(id, revision);
    return reason;
  }
}

export function runFaultScenario(type, now = Date.now(), decide = decisionFor) {
  const input = { id: "fault-fixture", revision: 3, observedAt: now - 1000, magnitude: 5.2, quality: 0.92, latitude: 37.4, longitude: -122.1, depthKm: 12 };
  let expected;
  let observed;
  if (type === "duplicate" || type === "out-of-order") {
    const gate = new RevisionGate();
    gate.commit(input.id, input.revision);
    input.revision = type === "duplicate" ? 3 : 2;
    observed = gate.check(input.id, input.revision);
    expected = type === "duplicate" ? "duplicate_revision" : "out_of_order_revision";
  } else if (type === "stale" || type === "malformed") {
    if (type === "stale") input.observedAt = now - 180000;
    else input.magnitude = null;
    observed = decide(input, now).reason;
    expected = type === "stale" ? "stale_event" : "malformed_input";
  } else throw new Error("Unknown fault scenario");
  return { type, input, expected, observed, passed: observed === expected, executedAt: new Date(now).toISOString(), scope: "browser-model-only" };
}

export function normalizeFeature(feature) {
  const coordinates = feature.geometry?.coordinates || [];
  return {
    id: String(feature.id || "unknown"),
    revision: feature.properties?.updated ?? feature.properties?.time ?? -1,
    place: String(feature.properties?.place || "Location unavailable"),
    observedAt: feature.properties?.time,
    magnitude: feature.properties?.mag,
    latitude: coordinates[1], longitude: coordinates[0], depthKm: coordinates[2],
    // An illustrative input, not a USGS confidence or uncertainty measurement.
    quality: feature.properties?.status === "reviewed" ? 0.95 : 0.75,
  };
}
