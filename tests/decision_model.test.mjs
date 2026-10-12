import test from "node:test";
import assert from "node:assert/strict";
import { decisionFor, RevisionGate, runFaultScenario, normalizeFeature } from "../public/decision-model.js";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const base = { observedAt: NOW - 1000, magnitude: 5.2, quality: 0.92, latitude: 37.4, longitude: -122.1, depthKm: 12 };
const reason = (patch) => decisionFor({ ...base, ...patch }, NOW).reason;

test("nominal candidate meets the test threshold", () => {
  const d = decisionFor(base, NOW);
  assert.equal(d.reason, "test_threshold_met");
  assert.equal(d.candidate, true);
});

test("non-finite inputs fail closed as malformed", () => {
  for (const field of ["magnitude", "quality", "observedAt", "latitude", "longitude", "depthKm"]) {
    for (const bad of [null, undefined, NaN, Infinity, "5"]) {
      assert.equal(reason({ [field]: bad }), "malformed_input", `${field}=${String(bad)}`);
    }
  }
});

test("range boundaries", () => {
  assert.equal(reason({ latitude: 90 }), "test_threshold_met");
  assert.equal(reason({ latitude: 90.0001 }), "input_out_of_range");
  assert.equal(reason({ longitude: -180.0001 }), "input_out_of_range");
  assert.equal(reason({ depthKm: 800.1 }), "input_out_of_range");
  assert.equal(reason({ depthKm: -5.1 }), "input_out_of_range");
  assert.equal(reason({ magnitude: 10.1 }), "input_out_of_range");
  assert.equal(reason({ quality: 1.01 }), "input_out_of_range");
  assert.equal(reason({ observedAt: NOW + 1 }), "input_out_of_range", "future timestamps rejected");
});

test("freshness and quality gates", () => {
  assert.equal(reason({ observedAt: NOW - 120000 }), "below_test_threshold", "exactly at window: score decays to zero");
  assert.equal(reason({ observedAt: NOW - 120001 }), "stale_event");
  assert.equal(reason({ quality: 0.6499 }), "insufficient_quality");
  assert.equal(reason({ magnitude: 4.4 }), "below_test_threshold");
});

test("revision gate rejects duplicates, regressions, and bad identifiers", () => {
  const gate = new RevisionGate(2);
  assert.equal(gate.commit("a", 3), "accepted");
  assert.equal(gate.check("a", 3), "duplicate_revision");
  assert.equal(gate.check("a", 2), "out_of_order_revision");
  assert.equal(gate.check("a", 4), "accepted");
  assert.equal(gate.check("", 1), "invalid_revision");
  assert.equal(gate.check("b", -1), "invalid_revision");
  assert.equal(gate.check("b", 1.5), "invalid_revision");
  assert.equal(gate.commit("b", 1), "accepted");
  assert.equal(gate.check("c", 1), "capacity_reached");
});

test("all browser fault scenarios pass against the reference policy", () => {
  for (const type of ["duplicate", "stale", "malformed", "out-of-order"]) {
    assert.equal(runFaultScenario(type, NOW).passed, true, type);
  }
});

test("mutation: stale scenario detects a policy that ignores event age", () => {
  const ignoresAge = (event, now) => decisionFor({ ...event, observedAt: now - 1000 }, now);
  assert.equal(runFaultScenario("stale", NOW, ignoresAge).passed, false);
});

test("mutation: malformed scenario detects a policy that skips validation", () => {
  const permissive = () => ({ candidate: true, reason: "test_threshold_met", score: 9 });
  assert.equal(runFaultScenario("malformed", NOW, permissive).passed, false);
});

test("USGS GeoJSON normalization", () => {
  const e = normalizeFeature({ id: "us7000abcd", geometry: { coordinates: [-122.1, 37.4, 12] }, properties: { time: NOW - 5000, updated: NOW - 1000, mag: 4.8, place: "Test", status: "reviewed" } });
  assert.equal(e.id, "us7000abcd");
  assert.equal(e.revision, NOW - 1000);
  assert.equal(e.latitude, 37.4);
  assert.equal(e.quality, 0.95);
  const empty = normalizeFeature({});
  assert.equal(decisionFor(empty, NOW).reason, "malformed_input");
});
