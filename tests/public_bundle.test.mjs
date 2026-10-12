// Guards against publishing internal material or agency branding in public-facing files.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
["public", "wordpress", "docs"].forEach(walk);
const text = (f) => readFileSync(f, "utf8");

test("no Markdown documents are served from the dashboard or WordPress packages", () => {
  assert.deepEqual(files.filter((f) => /^(public|wordpress)\//.test(f) && /\.md$/i.test(f)), []);
});

test("served files do not use the agency program name as branding", () => {
  for (const f of files.filter((f) => /^(public|wordpress)\//.test(f) && /\.(html|php|css|js)$/.test(f))) {
    assert.doesNotMatch(text(f), /shake\s*alert/i, f);
  }
});

test("public docs contain no internal bid strategy", () => {
  for (const f of files.filter((f) => f.startsWith("docs/"))) {
    assert.doesNotMatch(text(f), /go or no-go|teaming role|proposal evidence gap|named[- ]personnel/i, f);
  }
});

test("required disclaimer is present on the dashboard", () => {
  const html = text("public/index.html");
  assert.match(html, /Not affiliated with or endorsed by USGS/);
  assert.match(html, /Not deployed for public warning or life-safety decisions/);
});

test("evidence reports parse and agree with their summaries", () => {
  const report = JSON.parse(text("public/data/assurance-report.json"));
  assert.equal(report.summary.total, report.scenarios.length);
  assert.equal(report.summary.passed, report.scenarios.filter((s) => s.passed).length);
  assert.equal(report.operationalUse, false);
  const transport = JSON.parse(text("public/data/transport-evidence.json"));
  assert.ok(Object.values(transport.checks).every((v) => typeof v === "boolean"));
  const links = JSON.parse(text("public/data/links.json"));
  for (const k of ["repository", "pipeline"]) assert.match(links[k], /^$|^https:\/\/(github\.com|gitlab\.com)\//, k);
});

test("evidence files carry no local machine paths", () => {
  for (const f of files.filter((f) => f.startsWith("public/data/"))) {
    assert.doesNotMatch(text(f), /\/Users\/|\/home\/[a-z]/, f);
  }
});
