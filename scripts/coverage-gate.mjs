// Fails when C++ coverage drops below the configured floor (SOW 3.2.2: configurable coverage-decline alerts).
import { readFileSync } from "node:fs";
const floor = { lines: Number(process.env.COVERAGE_FLOOR_LINES || 95), branches: Number(process.env.COVERAGE_FLOOR_BRANCHES || 90) };
const data = JSON.parse(readFileSync("reports/cpp-coverage.json", "utf8"));
const totals = data.data[0].totals;
const lines = totals.lines.percent, branches = totals.branches.percent;
console.log(`coverage lines=${lines.toFixed(2)}% (floor ${floor.lines}) branches=${branches.toFixed(2)}% (floor ${floor.branches})`);
if (lines < floor.lines || branches < floor.branches) { console.error("coverage below floor"); process.exit(1); }
