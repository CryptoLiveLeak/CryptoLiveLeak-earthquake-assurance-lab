# Claims Boundary

## Implemented and testable

- Independent C++ demonstration policy with finite/range validation and deterministic outcomes.
- Browser policy cross-checked against C++ boundary cases.
- Executed JavaScript fault scenarios. A broken policy produces FAIL rather than a predetermined success message.
- Source-hash-linked C++ reports, a transport-configuration report, and a nine-scenario fault-injection integration suite run against a real NATS JetStream server in CI.
- A findings log (`docs/FINDINGS.md`) of eleven defects found in the lab's own 0.2.0 code, each corrected with regression evidence, including before/after integration results.
- Code metrics (LOC, cyclomatic complexity, Halstead), LLVM coverage, sanitizer runs, static analysis, SBOM, and an Ansible deployment playbook, all exercised in CI.
- Installable WordPress dashboard plugin and optional theme, with no credentials or live broker required on the WordPress host.

## Limits of the evidence

CI evidence is only as current as the linked pipeline run; cite a run URL and commit rather than describing results in general terms.

The integration suite runs one broker on one host. It does not prove hard-crash (SIGKILL) recovery, replay from an arbitrary stream sequence, sustained throughput or latency, or production availability. Aggregator revision state is in memory and is not persisted across restarts. NATS runs without authentication or TLS and binds to loopback only.

## Claims not supported by this lab

- ShakeAlert production source access or equivalent scientific algorithms.
- Public early warning, USGS/FEMA endorsement, agency approval, certification, or operational life-safety suitability.
- Prior operation or maintenance of a production public-safety system.
- Completion of any agency statement of work.
- Digitally signed reports: the current reports use SHA-256 integrity hashes, not signatures.
- Real-time performance guarantees. Timing figures include process startup and are single observations.

## Required disclaimer

Independent reference implementation using public and synthetic data. Not affiliated with or endorsed by USGS. Not deployed for public warning or life-safety decisions.
