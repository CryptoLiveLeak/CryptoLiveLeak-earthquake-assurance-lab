// Regression tests for FINDING CLL-001 (fail-closed ingestion) and CLL-002/006 (revision gate).
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFeature, validateEvent, validateDecision, eventKeyFor } from "../services/lib/event-contract.mjs";
import { RevisionGate } from "../services/lib/revision-gate.mjs";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const feature = (patch = {}, coords = [-122.1, 37.4, 10]) => ({
  id: "us7000test",
  properties: { mag: 5.6, time: NOW - 3000, updated: NOW, status: "reviewed", ...patch },
  geometry: { coordinates: coords },
});

test("valid feature normalizes with a deterministic key", () => {
  const r = normalizeFeature(feature());
  assert.equal(r.ok, true);
  assert.equal(r.event.magnitude, 5.6);
  assert.equal(r.event.depthKm, 10);
  assert.equal(r.event.sourceRevision, NOW);
  assert.equal(r.event.eventKey, eventKeyFor("us7000test", NOW));
  assert.equal(validateEvent(r.event), null);
});

test("CLL-001: null magnitude is rejected, not coerced to 0", () => {
  assert.deepEqual(normalizeFeature(feature({ mag: null })).reason, "missing_magnitude");
});

test("CLL-001: null depth is rejected, not coerced to 0 km", () => {
  assert.equal(normalizeFeature(feature({}, [-122.1, 37.4, null])).reason, "missing_depth");
  assert.equal(normalizeFeature(feature({}, [-122.1, 37.4])).reason, "missing_depth");
});

test("CLL-001: missing event time is rejected, not replaced with ingest time", () => {
  assert.equal(normalizeFeature(feature({ time: undefined, updated: undefined })).reason, "missing_event_time");
  assert.equal(normalizeFeature(feature({ time: "2026-10-12" })).reason, "missing_event_time");
});

test("CLL-001: numeric strings and non-finite values are rejected", () => {
  assert.equal(normalizeFeature(feature({ mag: "5.6" })).reason, "missing_magnitude");
  assert.equal(normalizeFeature(feature({ mag: Infinity })).reason, "missing_magnitude");
  assert.equal(normalizeFeature(feature({}, ["-122", 37.4, 10])).reason, "missing_coordinates");
  assert.equal(normalizeFeature({ ...feature(), id: 42 }).reason, "invalid_event_id");
  assert.equal(normalizeFeature(null).reason, "invalid_event_id");
});

test("revision falls back to event time only when updated is absent", () => {
  assert.equal(normalizeFeature(feature({ updated: undefined })).event.sourceRevision, NOW - 3000);
  assert.equal(normalizeFeature(feature({ updated: -1 })).reason, "invalid_revision");
});

test("worker-side validation rejects tampered or incomplete events", () => {
  const { event } = normalizeFeature(feature());
  assert.equal(validateEvent({ ...event, depthKm: null }), "invalid_depthKm");
  assert.equal(validateEvent({ ...event, eventKey: "forged" }), "invalid_event_key");
  assert.equal(validateEvent({ ...event, observedAt: "not a date" }), "invalid_observed_at");
  assert.equal(validateEvent({ ...event, schemaVersion: 2 }), "unsupported_schema_version");
  assert.equal(validateEvent("x"), "not_an_object");
});

test("decision validation", () => {
  const d = { eventId: "a", sourceRevision: 0, eventKey: "k", candidate: true, reason: "test_threshold_met" };
  assert.equal(validateDecision(d), null);
  assert.equal(validateDecision({ ...d, candidate: "true" }), "invalid_candidate");
  assert.equal(validateDecision({ ...d, sourceRevision: 1.5 }), "invalid_revision");
});

test("CLL-002: revision 0 is remembered, so a replay is a duplicate", () => {
  const gate = new RevisionGate();
  assert.equal(gate.check("e", 0), "accepted");
  gate.commit("e", 0);
  assert.equal(gate.check("e", 0), "duplicate_revision");
  assert.equal(gate.check("e", 1), "accepted");
});

test("revision ordering", () => {
  const gate = new RevisionGate();
  gate.commit("e", 5);
  assert.equal(gate.check("e", 4), "out_of_order_revision");
  assert.equal(gate.commit("e", 4), false);
  assert.equal(gate.commit("e", 6), true);
});

test("CLL-003: check does not mutate state, so a failed publish can be retried", () => {
  const gate = new RevisionGate();
  assert.equal(gate.check("e", 1), "accepted");
  assert.equal(gate.check("e", 1), "accepted", "nothing recorded until commit");
});

test("CLL-006: memory is bounded with least-recently-updated eviction", () => {
  const gate = new RevisionGate(2);
  gate.commit("a", 1); gate.commit("b", 1); gate.commit("a", 2); gate.commit("c", 1);
  assert.equal(gate.size, 2);
  assert.equal(gate.evictions, 1);
  assert.equal(gate.check("b", 1), "accepted", "b was evicted (documented trade-off)");
  assert.equal(gate.check("a", 2), "duplicate_revision", "recently updated a retained");
  assert.throws(() => new RevisionGate(0), RangeError);
});
