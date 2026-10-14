#!/usr/bin/env python3
"""Documentation coverage and module dependency graph (SOW 3.1.1 items 5 and 6).

- Documentation coverage: share of functions whose definition is immediately preceded by a
  comment block (//, /* */, or JSDoc) — C++ and JavaScript, via lizard's function list.
- Dependency graph: ES-module import edges among services/, scripts/, tests/, public/ with
  fan-in, fan-out, and circular-dependency detection. Writes reports/dependency-graph.{json,dot}.
Exit 1 if a cycle exists or documentation coverage of production code is below the threshold.
"""
import json
import re
import sys
from pathlib import Path

import lizard

ROOT = Path(__file__).resolve().parent.parent
DOC_THRESHOLD = 0.60
GROUPS = {"executable": ["cpp", "services", "public/decision-model.js", "public/app.js"],
          "test": ["tests", "scripts"]}
EXT = {".cpp", ".mjs", ".js"}
IMPORT_RE = re.compile(r'^\s*import\s[^;]*?from\s+["\'](\.{1,2}/[^"\']+)["\']', re.M)


def files_for(entries):
    out = []
    for e in entries:
        p = ROOT / e
        out += [p] if p.is_file() else sorted(x for x in p.rglob("*") if x.suffix in EXT)
    return out


def documented(lines, start_line):
    """True if the lines above the function start are a comment (allowing decorators/blank)."""
    i = start_line - 2
    while i >= 0 and lines[i].strip() == "":
        i -= 1
    if i < 0:
        return False
    s = lines[i].strip()
    return s.startswith("//") or s.endswith("*/") or s.startswith("*") or s.startswith("/*")


def doc_coverage():
    result = {}
    for group, entries in GROUPS.items():
        total = docd = 0
        missing = []
        for path in files_for(entries):
            lines = path.read_text().splitlines()
            for fn in lizard.analyze_file(str(path)).function_list:
                if fn.name.startswith("(anonymous") or fn.nloc < 3:
                    continue  # arrow callbacks and trivial one-liners are not public API surface
                total += 1
                if documented(lines, fn.start_line):
                    docd += 1
                else:
                    missing.append(f"{path.relative_to(ROOT)}:{fn.start_line} {fn.name}")
        result[group] = {"functions": total, "documented": docd,
                         "coverage": round(docd / total, 3) if total else None, "undocumented": missing}
    return result


def dependency_graph():
    nodes = sorted(str(p.relative_to(ROOT)) for p in files_for(["services", "scripts", "tests", "public"]) if p.suffix != ".cpp")
    edges = []
    for n in nodes:
        for target in IMPORT_RE.findall((ROOT / n).read_text()):
            resolved = (ROOT / n).parent.joinpath(target).resolve()
            try:
                edges.append((n, str(resolved.relative_to(ROOT))))
            except ValueError:
                pass
    fan_out = {n: sum(1 for a, _ in edges if a == n) for n in nodes}
    fan_in = {n: sum(1 for _, b in edges if b == n) for n in nodes}
    # Cycle detection (DFS).
    adj = {n: [b for a, b in edges if a == n] for n in nodes}
    cycles, state = [], {}

    def visit(n, stack):
        state[n] = 1
        for m in adj.get(n, []):
            if state.get(m) == 1:
                cycles.append(stack[stack.index(m):] + [m])
            elif m not in state:
                visit(m, stack + [m])
        state[n] = 2
    for n in nodes:
        if n not in state:
            visit(n, [n])
    external = sorted({m.group(1) for n in nodes for m in re.finditer(r'from\s+["\']([^./][^"\']*)["\']', (ROOT / n).read_text())})
    return {"nodes": nodes, "edges": [{"from": a, "to": b} for a, b in edges], "fanIn": fan_in, "fanOut": fan_out,
            "cycles": cycles, "externalDependencies": external,
            "highFanIn": sorted((n for n in nodes if fan_in[n] >= 3), key=lambda n: -fan_in[n])}


def main():
    out = ROOT / "reports"
    out.mkdir(exist_ok=True)
    docs = doc_coverage()
    graph = dependency_graph()
    (out / "documentation-coverage.json").write_text(json.dumps(docs, indent=2) + "\n")
    (out / "dependency-graph.json").write_text(json.dumps(graph, indent=2) + "\n")
    dot = ["digraph lab {", "  rankdir=LR; node [shape=box, fontname=Helvetica];"]
    dot += [f'  "{e["from"]}" -> "{e["to"]}";' for e in graph["edges"]]
    (out / "dependency-graph.dot").write_text("\n".join(dot + ["}"]) + "\n")
    ex = docs["executable"]
    print(f"Documentation coverage (executable): {ex['documented']}/{ex['functions']} = {ex['coverage']}")
    print(f"Documentation coverage (test/tooling): {docs['test']['documented']}/{docs['test']['functions']} = {docs['test']['coverage']}")
    print(f"Dependency graph: {len(graph['nodes'])} modules, {len(graph['edges'])} edges, cycles: {len(graph['cycles'])}, "
          f"high fan-in: {graph['highFanIn']}")
    for m in ex["undocumented"]:
        print("  undocumented:", m)
    failed = bool(graph["cycles"]) or (ex["coverage"] or 0) < DOC_THRESHOLD
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
