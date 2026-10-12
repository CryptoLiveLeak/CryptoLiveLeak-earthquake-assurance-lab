import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";

const engine = process.env.DECISION_ENGINE || path.resolve("build/alert_decision");

function decide(values) {
  const result = spawnSync(engine, values.map(String), { encoding: "utf8", timeout: 1000 });
  return { result, output: result.status === 0 ? JSON.parse(result.stdout) : null };
}

test("marks a recent, high-quality event as a simulated candidate", () => {
  const { result, output } = decide([5.2, 0.92, 8000, 37.4, -122.1, 12]);
  assert.equal(result.status, 0);
  assert.equal(output.candidate, true);
  assert.equal(output.reason, "test_threshold_met");
});

test("rejects a stale event", () => {
  const { output } = decide([5.8, 0.95, 180000, 37.4, -122.1, 12]);
  assert.equal(output.candidate, false);
  assert.equal(output.reason, "stale_event");
});

test("rejects insufficient quality", () => {
  const { output } = decide([6.1, 0.3, 5000, 37.4, -122.1, 12]);
  assert.equal(output.candidate, false);
  assert.equal(output.reason, "insufficient_quality");
});

test("fails closed on malformed numeric input", () => {
  const { result } = decide(["invalid", 0.9, 5000, 37.4, -122.1, 12]);
  assert.equal(result.status, 65);
});

test("rejects out-of-range coordinates", () => {
  const { output } = decide([5.5, 0.9, 5000, 120, -122.1, 12]);
  assert.equal(output.candidate, false);
  assert.equal(output.reason, "input_out_of_range");
});

test("rejects missing arguments and partially parsed numbers", () => {
  assert.equal(decide([5]).result.status, 64);
  for (const value of ["5oops", "NaN", "Infinity", "1e9999"]) {
    assert.equal(decide([value, .9, 1000, 0, 0, 10]).result.status, 65);
  }
});
