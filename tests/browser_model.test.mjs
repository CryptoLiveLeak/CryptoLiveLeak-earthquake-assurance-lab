import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { decisionFor, normalizeFeature, RevisionGate, runFaultScenario } from "../public/decision-model.js";

const now = 2000000000000;
test("browser policy agrees with C++ across thresholds and invalid ranges", () => {
  const vectors = [
    [5.2, .92, 8000, 37.4, -122.1, 12], [3.2, .91, 4000, 36, -121, 8],
    [5.8, .95, 180000, 37, -122, 12], [6.1, .3, 5000, 37, -122, 12],
    [4.5, 1, 0, 0, 0, 0], [10, 1, 120000, 90, 180, 800],
    [10, 1, 120001, 0, 0, 0], [5, .65, 0, 0, 0, -5],
    [11, .9, 0, 0, 0, 0], [5, 1.1, 0, 0, 0, 0], [5, .9, -1, 0, 0, 0],
    [5, .9, 3600001, 0, 0, 0], [5, .9, 0, 91, 0, 0], [5, .9, 0, 0, 181, 0],
    [5, .9, 0, 0, 0, 801], [-3, .9, 0, 0, 0, 0],
  ];
  for (const vector of vectors) {
    const [magnitude, quality, age, latitude, longitude, depthKm] = vector;
    const result = spawnSync(process.env.DECISION_ENGINE || "build/alert_decision", vector.map(String), { encoding: "utf8", timeout: 1000 });
    assert.equal(result.status, 0, result.stderr);
    const native = JSON.parse(result.stdout);
    const browser = decisionFor({ magnitude, quality, observedAt: now - age, latitude, longitude, depthKm }, now);
    assert.equal(browser.reason, native.reason, JSON.stringify(vector));
    assert.equal(browser.candidate, native.candidate);
    assert.ok(Math.abs(browser.score - native.score) <= .00051);
  }
});

test("null magnitudes and missing timestamps are not normalized to valid numbers", () => {
  const event = normalizeFeature({ id: "x", properties: { mag: null }, geometry: { coordinates: [0, 0, 0] } });
  assert.equal(event.magnitude, null);
  assert.equal(decisionFor(event, now).reason, "malformed_input");
});

test("revision zero deduplicates, future revisions advance, memory is bounded", () => {
  const gate = new RevisionGate(1);
  assert.equal(gate.commit("x", 0), "accepted");
  assert.equal(gate.check("x", 0), "duplicate_revision");
  assert.equal(gate.commit("x", 2), "accepted");
  assert.equal(gate.check("x", 1), "out_of_order_revision");
  assert.equal(gate.commit("y", 1), "capacity_reached");
  assert.equal(gate.check("x", NaN), "invalid_revision");
});

for (const type of ["duplicate", "stale", "malformed", "out-of-order"]) {
  test(`fault ${type} executes assertions`, () => assert.equal(runFaultScenario(type, now).passed, true));
}
test("a broken policy causes a failing fault result instead of canned PASS", () => {
  assert.equal(runFaultScenario("stale", now, () => ({ reason: "test_threshold_met" })).passed, false);
});
