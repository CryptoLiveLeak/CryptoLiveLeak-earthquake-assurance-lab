import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

export function provenance() {
  const inputs = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) inputs.push([file, createHash("sha256").update(readFileSync(file)).digest("hex")]);
    }
  }
  for (const dir of ["cpp", "services", "scripts", "tests", "nats", "docs"]) visit(dir);
  for (const file of ["public/app.js", "public/decision-model.js", "public/index.html", "public/styles.css", "package.json", "package-lock.json", ".gitlab-ci.yml"]) {
    inputs.push([file, createHash("sha256").update(readFileSync(file)).digest("hex")]);
  }
  inputs.sort(([a], [b]) => a.localeCompare(b));
  let commit = process.env.CI_COMMIT_SHA || process.env.GITHUB_SHA || "source-export";
  let dirty = null;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const paths = inputs.map(([file]) => file);
    dirty = Boolean(execFileSync("git", ["diff", "HEAD", "--name-only", "--", ...paths], { encoding: "utf8" }).trim() ||
      execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ...paths], { encoding: "utf8" }).trim());
  } catch { /* CI-provided commit remains available without a Git executable. */ }
  return { commit, workingTreeDirty: dirty, sourceSha256: createHash("sha256").update(JSON.stringify(inputs)).digest("hex"), inputs, digitallySigned: false };
}
