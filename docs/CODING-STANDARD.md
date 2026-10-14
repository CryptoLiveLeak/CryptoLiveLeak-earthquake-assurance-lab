# Coding Standard

A concise, enforceable standard for a small team, written to SOW 3.2.3's shape: naming, file structure, error handling, and documentation. Every rule below is either checked automatically in CI or reviewed with a named checklist item. Reference frameworks: **SEI CERT C++** (security-relevant rules), a **MISRA C++:2023-style subset** for safety-relevant constructs, and **SEI CERT concurrency guidance**. The exact rule set for an agency code base is agreed at kickoff based on its language profile and build system.

## 1. Automated enforcement (runs on every commit and merge request)

| Rule | Tool | Where |
| --- | --- | --- |
| Warnings are errors; `-Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion -Wshadow -Wformat=2 -Wcast-align` | clang++ | `npm run build` |
| Stack protector and `_FORTIFY_SOURCE=2` on release builds | clang++ | `npm run build` |
| CERT, bugprone, concurrency, performance, misc checks as errors | clang-tidy (`.clang-tidy`) | `npm run lint:cpp` |
| Warning, style, performance, portability checks | cppcheck | `npm run lint:cpp` |
| Memory safety and undefined behavior under test | AddressSanitizer, UBSan | `npm run test:sanitized` |
| Cyclomatic complexity ≤ 15 per function; cognitive complexity ≤ 25 | lizard, clang-tidy | `npm run metrics` |
| Documentation coverage ≥ 60% of production functions | `scripts/doc_dependency_metrics.py` | `npm run metrics` |
| No circular module dependencies | `scripts/doc_dependency_metrics.py` | `npm run metrics` |
| Unit test coverage reported on every merge request; decline below the configured floor fails the job | llvm-cov, GitLab `coverage:` keyword | `.gitlab-ci.yml` |
| Dependency inventory and vulnerability audit | `npm sbom`, `npm audit` | `npm run sbom` |
| PHP syntax | `php -l` | `npm run lint:php` |
| Ansible playbooks lint clean at the production profile | ansible-lint | CI |

## 2. Naming

- C++: `snake_case` for functions and variables, `PascalCase` for types, `kCamelCase` for constants, `UPPER_SNAKE` only for macros (avoid macros).
- JavaScript: `camelCase` for functions and variables, `PascalCase` for classes, `UPPER_SNAKE` for module-level constants.
- Reason codes, message subjects, and JSON field names are stable identifiers: `snake_case` for reason codes, dotted lower-case for subjects, `camelCase` for JSON fields. Changing one is a schema change and bumps `schemaVersion`.
- No single-letter names outside loop indices and lambda parameters of one line.

## 3. File structure

- One component per file; one public entry point per service file; shared logic in `services/lib/`.
- Tests mirror the source they cover (`tests/<name>.test.mjs`) and are tagged with the finding ID they guard (`CLL-00n`) in the test name.
- Every evidence-producing script writes to `public/data/` (published) or `reports/` (CI artifact) and nowhere else.
- No generated files, binaries, credentials, or local paths in the repository. `tests/public_bundle.test.mjs` enforces the last two for published files.

## 4. Error handling

- **Fail closed.** A missing, null, non-numeric, or non-finite input is rejected with a named reason. It is never coerced to a default. (CERT INT, FLP; see FINDINGS CLL-001.)
- **Every rejection carries a reason code** from a documented set, so logs and dead-letter records are machine-filterable.
- **No silent drops.** A message that cannot be processed after bounded retries is written to the dead-letter subject with its payload (CLL-004). Catch blocks either recover, retry with a bound, or dead-letter; they never only log.
- **Commit after publish.** State that acknowledges work is updated only after the downstream effect succeeded (CLL-003).
- **Bounded everything:** retries, retry delay, process timeouts, in-memory maps, output buffers, message counts, stream bytes.
- **Exit codes are part of the contract:** 0 decision produced, 64 usage, 65 malformed input.
- C++: no raw `new`/`delete`, no C-style casts, no uninitialized variables, no exceptions across the CLI boundary (caught in `main`), `std::string`/`string_view` instead of pointer arithmetic on `argv` beyond indexing.
- Concurrency: the C++ component is single-threaded by design. Node services are single event loop; blocking calls (`spawnSync`, sync I/O) are prohibited in message handlers (CLL-009).

## 5. Documentation

- Every non-trivial function has a one-line comment stating what it does and any contract (units, ranges, exit codes). Measured by the documentation-coverage metric.
- Every finding is logged in `docs/FINDINGS.md` with severity, location, consequence, correction, and regression evidence.
- Message contracts live in `docs/MESSAGE-CONTRACTS.md` and change only with a `schemaVersion` bump.
- Commit messages: imperative summary line ≤ 72 characters, blank line, then what changed and why, and the finding ID when applicable.

## 6. Review checklist (manual, per merge request)

1. Does any new input path coerce or default a missing value? (Reject instead.)
2. Does any new catch block swallow an error without retry-with-bound or dead-letter?
3. Is any new map, queue, buffer, or loop unbounded?
4. Is any new state committed before the effect it represents has succeeded?
5. Does a schema, subject, or reason code change without a `schemaVersion` bump and contract doc update?
6. Is any timing, latency, or coverage figure claimed without a linked, reproducible run?

## 7. Branching and release (GitLab workflow)

- `main` is protected: merge requests only, at least one approval, pipeline must pass, no force-push.
- Feature branches are short-lived and rebased before merge; squash merges keep one commit per change.
- Releases are annotated tags `vMAJOR.MINOR.PATCH`; the WordPress packages and evidence reports carry the tag and commit. A rollback is a redeploy of the previous tag.
