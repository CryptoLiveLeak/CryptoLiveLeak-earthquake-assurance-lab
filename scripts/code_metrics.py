#!/usr/bin/env python3
"""Quantitative code metrics: executable vs. test LOC, cyclomatic complexity, Halstead.

Writes reports/code-metrics.json and reports/code-metrics.md. Requires `lizard` and
`multimetric` (pip install lizard multimetric). Thresholds follow common review practice:
cyclomatic complexity > 15 per function is flagged for review.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CCN_THRESHOLD = 15
SOURCES = {
    "executable": ["cpp", "services", "public/decision-model.js", "public/app.js"],
    "test": ["tests", "scripts/verify-integration.mjs", "scripts/verify-transport.mjs", "scripts/run-assurance.mjs"],
}
EXTENSIONS = {".cpp", ".hpp", ".h", ".mjs", ".js"}


def files_for(entries):
    out = []
    for entry in entries:
        path = ROOT / entry
        if path.is_file():
            out.append(path)
        else:
            out.extend(sorted(p for p in path.rglob("*") if p.suffix in EXTENSIONS))
    return out


def lizard_functions(paths):
    import lizard  # noqa: PLC0415

    functions = []
    per_file = {}
    for path in paths:
        analysis = lizard.analyze_file(str(path))
        rel = str(path.relative_to(ROOT))
        per_file[rel] = {"nloc": analysis.nloc, "functions": len(analysis.function_list)}
        for fn in analysis.function_list:
            functions.append({
                "file": rel, "function": fn.name, "startLine": fn.start_line,
                "nloc": fn.nloc, "ccn": fn.cyclomatic_complexity, "parameters": len(fn.parameters),
            })
    return functions, per_file


def halstead(paths):
    if not paths:
        return {}
    raw = subprocess.run(["multimetric", *map(str, paths)], capture_output=True, text=True, check=True).stdout
    data = json.loads(raw)
    keep = ["loc", "comment_ratio", "cyclomatic_complexity", "halstead_volume", "halstead_difficulty",
            "halstead_effort", "halstead_bugprop", "maintainability_index", "operators_uniq", "operands_uniq"]
    files = {str(Path(k).resolve().relative_to(ROOT)): {m: v.get(m) for m in keep} for k, v in data["files"].items()}
    overall = {m: data["overall"].get(m) for m in keep}
    # multimetric's aggregate maintainability index is computed from summed volume and is not
    # meaningful across files; report the per-file mean instead.
    mis = [f["maintainability_index"] for f in files.values() if f.get("maintainability_index") is not None]
    overall["maintainability_index"] = round(sum(mis) / len(mis), 1) if mis else None
    return {"overall": overall, "files": files}


def main():
    report = {"schemaVersion": 1, "ccnThreshold": CCN_THRESHOLD, "groups": {}}
    flagged = []
    for group, entries in SOURCES.items():
        paths = files_for(entries)
        functions, per_file = lizard_functions(paths)
        ccns = [f["ccn"] for f in functions]
        group_flagged = [f for f in functions if f["ccn"] > CCN_THRESHOLD]
        flagged.extend(group_flagged)
        report["groups"][group] = {
            "files": len(paths),
            "nloc": sum(v["nloc"] for v in per_file.values()),
            "physicalLines": sum(len(p.read_text().splitlines()) for p in paths),
            "functions": len(functions),
            "ccnMax": max(ccns, default=0),
            "ccnMean": round(sum(ccns) / len(ccns), 2) if ccns else 0,
            "flaggedFunctions": group_flagged,
            "perFile": per_file,
            "halstead": halstead(paths),
            "topComplexity": sorted(functions, key=lambda f: -f["ccn"])[:10],
        }
    ex, te = report["groups"]["executable"], report["groups"]["test"]
    report["testToExecutableNlocRatio"] = round(te["nloc"] / ex["nloc"], 2) if ex["nloc"] else None

    out = ROOT / "reports"
    out.mkdir(exist_ok=True)
    (out / "code-metrics.json").write_text(json.dumps(report, indent=2) + "\n")

    lines = ["# Code metrics", "", "| Group | Files | NLOC | Physical lines | Functions | Max CCN | Mean CCN | Halstead volume | Mean maintainability index |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for group, g in report["groups"].items():
        h = g["halstead"].get("overall", {})
        lines.append(f"| {group} | {g['files']} | {g['nloc']} | {g['physicalLines']} | {g['functions']} | {g['ccnMax']} | {g['ccnMean']} | "
                     f"{round(h.get('halstead_volume') or 0, 1)} | {round(h.get('maintainability_index') or 0, 1)} |")
    lines += ["", f"Test-to-executable NLOC ratio: {report['testToExecutableNlocRatio']}", "",
              f"Functions above CCN {CCN_THRESHOLD}: {len(flagged)}"]
    for f in flagged:
        lines.append(f"- `{f['file']}:{f['startLine']}` {f['function']} (CCN {f['ccn']})")
    (out / "code-metrics.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())
