# CryptoLiveLeak Earthquake Assurance Lab

**CryptoLiveLeak, Inc.** · UEI EN2ZSMQ19AL4 · CAGE 1ZQ48 · Dashboard: https://assurance-lab.cryptoliveleak.com

This is an independent software-assurance reference implementation. It shows how we review and harden distributed real-time event-processing software. It has three parts:

- a C++20 decision component;
- Node.js services on NATS JetStream for ingestion, decisions, and aggregation;
- the review apparatus around them: fault-injection integration tests, code metrics, coverage, sanitizers, static analysis, SBOM, CI, and an Ansible deployment.

> Independent reference implementation using public and synthetic data. Not affiliated with or endorsed by USGS. Not deployed for public warning or life-safety decisions. The decision thresholds are illustrative test rules, not seismology.

## Start here

| If you want to see… | Open |
| --- | --- |
| What we found in our own code and how each defect was fixed and regression-tested | [`docs/FINDINGS.md`](docs/FINDINGS.md) |
| Which review areas are demonstrated and how | [`docs/REQUIREMENTS-TRACEABILITY.md`](docs/REQUIREMENTS-TRACEABILITY.md) |
| What this lab does **not** claim | [`docs/CLAIMS-BOUNDARY.md`](docs/CLAIMS-BOUNDARY.md) |
| System design and message contracts | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/MESSAGE-CONTRACTS.md`](docs/MESSAGE-CONTRACTS.md) |
| Latest CI evidence | the Actions tab; each run uploads reports, JUnit results, integration evidence, and WordPress packages |

## Layout

```
cpp/                 C++20 decision component (finite and range validation, reason-coded JSON output)
services/            ingestor, decision-worker, aggregator, NATS client, static dashboard server
services/lib/        event contract (fail-closed), revision gate, failure handling and dead-lettering
tests/               unit, C++/JavaScript parity, contract, mutation, and public-bundle guard tests
scripts/             assurance scenarios, fault-injection integration suite, transport check,
                     coverage, code metrics, provenance, WordPress packaging
public/              reviewer dashboard (static) and its evidence files in public/data/
ansible/             single-host deployment playbook (pinned, checksum-verified NATS; systemd; smoke test)
wordpress/           WordPress plugin and optional theme that embed the dashboard (GPL-2.0-or-later)
evidence/            historical reports from 0.2.0 and the before-fix integration run
```

## Run it

Prerequisites: Node.js 20 or later, a C++20 `clang++`, and optionally LLVM tools, Python 3 with `lizard` and `multimetric`, and a `nats-server` binary or Docker.

```sh
npm ci
npm run verify              # build (warnings as errors), unit tests, assurance scenarios
npm run test:sanitized      # AddressSanitizer + UndefinedBehaviorSanitizer
npm run coverage:cpp        # LLVM line/function/branch coverage -> reports/
npm run metrics             # LOC, cyclomatic complexity, Halstead -> reports/
npm run sbom                # CycloneDX SBOM -> reports/

nats-server -a 127.0.0.1 -js &          # or: docker compose up nats
npm run verify:integration  # 9 fault-injection scenarios -> public/data/integration-evidence.json
npm run verify:transport    # stream and consumer configuration -> public/data/transport-evidence.json

npm run serve               # dashboard at http://127.0.0.1:4173
```

To run the full stack: `docker compose up --build`, then `docker compose run --rm ingestor`. NATS binds to loopback with no authentication. Do not expose it.

## Evidence integrity

Every report records its source commit, a SHA-256 hash of the source inputs, and a hash of its results. These are integrity checks, not digital signatures. Cite a specific pipeline run and commit rather than a general claim.

## License

Apache License 2.0 (see `LICENSE` and `NOTICE`). The WordPress plugin and theme are GPL-2.0-or-later (see `wordpress/LICENSE`).
