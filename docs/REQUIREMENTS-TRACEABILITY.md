# Review-Area Traceability

This table maps the production code-review areas named in public federal solicitations for independent review of real-time systems to what this lab demonstrates on its own code. It is a capability record, not a compliance certification. No agency production code has been reviewed by this lab.

Status key:
- **Verified in CI**: an automated job produces the evidence on every commit.
- **Demonstrated**: the evidence exists and is reproducible by a documented command.
- **Partial**: some of the area is covered, with the named gaps.
- **Not demonstrated**: no evidence yet.

| Review area | Evidence in this repository | Status |
| --- | --- | --- |
| Executable vs. test LOC | `scripts/code_metrics.py` → `reports/code-metrics.{json,md}` (NLOC and physical lines per group and per file) | Verified in CI |
| Cyclomatic complexity | Lizard per function, with CI failing above 15 (see FINDINGS CLL-010) | Verified in CI |
| Halstead metrics | multimetric volume, difficulty, effort, and maintainability index per file | Verified in CI |
| Unit-test coverage | LLVM line, function, and branch coverage of the C++ component (100/100/100) | Verified in CI |
| Documentation coverage | `scripts/doc_dependency_metrics.py`: share of production functions with a contract comment (32/32), CI floor 60% (CLL-012) | Verified in CI |
| Dependency analysis | Module dependency graph with fan-in/fan-out and cycle detection (`reports/dependency-graph.{json,dot}`); CycloneDX SBOM and `npm audit` gate | Verified in CI |
| Correctness and input ranges | C++ boundary tests, C++/JavaScript parity vectors, fail-closed contract (CLL-001) | Verified in CI |
| Missing and out-of-order data | Contract rejection, revision gate, out-of-order and revision-0 scenarios (CLL-001, CLL-002) | Verified in CI |
| Race conditions and memory safety | ASan/UBSan test run; clang-tidy CERT, bugprone, concurrency profile and cppcheck clean; hardened build flags (`-Wconversion`, stack protector, FORTIFY). ThreadSanitizer not applicable to the single-threaded component. | Verified in CI |
| Real-time safety | Bounded inputs, 1-second engine timeout, non-blocking invocation (CLL-009). No latency benchmark or guarantee. | Partial |
| Message interfaces | Versioned, validated contracts with dead-lettering (`docs/MESSAGE-CONTRACTS.md`) | Verified in CI |
| Tunable parameters | Named constants in C++ (`kMaxAgeMs`, `kMinQuality`, …), documented stream/consumer limits, `REVISION_CAPACITY` and coverage floors as validated environment settings | Partial |
| Failure propagation | Engine failure becomes a reason-coded decision; invalid or poison messages go to the dead-letter subject (CLL-004) | Verified in CI |
| Logging | Structured JSON logs per service with state, reason, sequence, and delivery count | Demonstrated |
| Timeouts, retries, backoff | 3-delivery cap with 1-second retry delay and dead-letter, verified against a real broker | Verified in CI |
| Restart and recovery | Graceful-drain restart resume verified. Hard-crash (SIGKILL) recovery and stream replay not yet measured. | Partial |
| Horizontal scaling | Queue-group scale-out, two replicas and exactly-once engine execution per event (CLL-005) | Verified in CI |
| CI workflow | GitHub Actions and GitLab CI with equivalent build, analyze, test, evidence, and package stages; branch protection and release policy in `docs/CODING-STANDARD.md` §7 | Verified in CI |
| Automated static analysis | clang-tidy CERT/bugprone/concurrency profile as errors (`.clang-tidy`), cppcheck, PHP lint; coverage shown on every GitLab MR with a configurable decline floor (`scripts/coverage-gate.mjs`) | Verified in CI |
| Deployment reproducibility | Ansible playbook (pinned, checksum-verified NATS; systemd units; smoke test), ansible-lint production profile; Docker Compose | Verified in CI (lint and syntax); a playbook run on a host is a manual step |
| Rollback | Tagged releases and versioned WordPress packages with SHA-256 manifests; no automated rollback exercise | Partial |
| Post-deployment smoke test | Ansible `/healthz` check; WordPress HTTP checks are manual | Partial |
| Scientific algorithms, uncertainty, alert pause | Out of scope: no agency source or scientific model is used | Not demonstrated |
| Coding standard | `docs/CODING-STANDARD.md`: naming, file structure, error handling, documentation, review checklist, GitLab workflow; automated rules mapped to tools | Demonstrated |
