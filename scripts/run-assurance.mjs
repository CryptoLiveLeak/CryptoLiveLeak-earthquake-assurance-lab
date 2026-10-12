import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { provenance } from "./provenance.mjs";

const engine = path.resolve("build/alert_decision");
const scenarios = [
  { name: "nominal_candidate", input: [5.2, 0.92, 8000, 37.4, -122.1, 12], expected: "test_threshold_met" },
  { name: "below_threshold", input: [3.2, 0.91, 4000, 36.2, -121.1, 8], expected: "below_test_threshold" },
  { name: "stale_event", input: [5.8, 0.95, 180000, 37.4, -122.1, 12], expected: "stale_event" },
  { name: "low_quality", input: [6.1, 0.3, 5000, 37.4, -122.1, 12], expected: "insufficient_quality" },
  { name: "invalid_latitude", input: [5.5, 0.9, 5000, 120, -122.1, 12], expected: "input_out_of_range" },
  { name: "invalid_depth", input: [5.5, 0.9, 5000, 37.4, -122.1, 1200], expected: "input_out_of_range" },
];

const results = scenarios.map((scenario) => {
  const started = process.hrtime.bigint();
  const execution = spawnSync(engine, scenario.input.map(String), { encoding: "utf8", timeout: 1000 });
  const elapsedMicros = Number(process.hrtime.bigint() - started) / 1000;
  const output = execution.status === 0 ? JSON.parse(execution.stdout) : { reason: "engine_failure" };
  return {
    name: scenario.name,
    passed: execution.status === 0 && output.reason === scenario.expected,
    expected: scenario.expected,
    observed: output.reason,
    latencyMicros: Math.round(elapsedMicros),
  };
});

const stableEvidence = results.map(({ latencyMicros, ...result }) => result);
const evidenceHash = createHash("sha256").update(JSON.stringify(stableEvidence)).digest("hex");
const sortedLatency = results.map((result) => result.latencyMicros).sort((a, b) => a - b);
const source = provenance();
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  release: source.workingTreeDirty ? `working-tree:${source.sourceSha256}` : source.commit,
  provenance: source,
  timingScope: "Process launch plus execution; six single observations, not a real-time SLA or performance benchmark.",
  profile: "reference-implementation",
  operationalUse: false,
  scenarios: results,
  summary: {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    p95LatencyMicros: sortedLatency[Math.max(0, Math.ceil(sortedLatency.length * 0.95) - 1)],
    evidenceHash,
  },
};

mkdirSync(path.resolve("public/data"), { recursive: true });
writeFileSync(path.resolve("public/data/assurance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
if (report.summary.failed > 0) process.exitCode = 1;
