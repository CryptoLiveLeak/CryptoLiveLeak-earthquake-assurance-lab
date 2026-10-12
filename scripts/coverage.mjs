import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve("build/coverage");
mkdirSync(dir, { recursive: true });
for (const file of readdirSync(dir).filter(name => name.endsWith(".profraw"))) rmSync(path.join(dir, file));
mkdirSync("reports", { recursive: true });
const engine = path.join(dir, "alert_decision");
execFileSync("clang++", ["-std=c++20", "-O0", "-g", "-fprofile-instr-generate", "-fcoverage-mapping", "cpp/alert_decision.cpp", "-o", engine], { stdio: "inherit" });
execFileSync(process.execPath, ["--test", "tests/decision_engine.test.mjs", "tests/browser_model.test.mjs"], {
  stdio: "inherit", env: { ...process.env, DECISION_ENGINE: engine, LLVM_PROFILE_FILE: path.join(dir, "%p-%m.profraw") },
});
const llvm = name => process.platform === "darwin" ? execFileSync("xcrun", ["--find", name], { encoding: "utf8" }).trim() : name;
const profiles = readdirSync(dir).filter(x => x.endsWith(".profraw")).map(x => path.join(dir, x));
const profile = path.join(dir, "merged.profdata");
execFileSync(llvm("llvm-profdata"), ["merge", "-sparse", ...profiles, "-o", profile]);
const report = execFileSync(llvm("llvm-cov"), ["report", engine, `-instr-profile=${profile}`], { encoding: "utf8" });
const data = execFileSync(llvm("llvm-cov"), ["export", engine, `-instr-profile=${profile}`], { encoding: "utf8" });
writeFileSync("reports/cpp-coverage.txt", report);
writeFileSync("reports/cpp-coverage.json", data);
console.log(report);
