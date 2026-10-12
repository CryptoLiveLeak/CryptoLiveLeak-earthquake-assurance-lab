# System Architecture

## Objective

The lab provides a low-cost, independently reproducible analogue for the software assurance work described in USGS RFI 140G0326Q0223 (independent production code review of an earthquake early-warning system). It exercises event ingestion, message ordering, fault handling, deterministic decision processing, aggregation, observability, code metrics, and CI/CD controls without copying or approximating USGS scientific algorithms.

## Design principles

1. Fail closed on malformed or out-of-range input.
2. Separate transport, decision, aggregation, and presentation concerns.
3. Make every test result traceable to a source revision.
4. Preserve raw events and decisions for replay.
5. Bound retries, execution time, memory growth, and message retention.
6. Treat all displayed alerts as simulations.
7. Keep the public site available without an always-on paid service.

## Components

### Event ingestor

The Node.js ingestor fetches the USGS all-hour GeoJSON feed or creates synthetic fixtures. It rejects any feature whose identifier, time, magnitude, coordinates, or depth is missing or non-numeric (never coercing or fabricating values), assigns a deterministic event key, and publishes normalized events to `lab.events.normalized`. Synthetic fixtures are the default; the public catalog is opt-in.

### Message transport

NATS JetStream retains normalized events, decisions, and simulated alerts in a bounded stream. Durable consumers use explicit acknowledgements, a five-second acknowledgement timeout, a maximum of three deliveries with a one-second retry delay, a 64-message acknowledgement window, and a queue group so replicas share work. A message that fails its final delivery, or violates the message contract, is written to `lab.deadletter.<consumer>` with its payload instead of being dropped. Deterministic message IDs suppress duplicate publications inside the configured duplicate window. Stream-limit drift is detected and corrected at startup.

### Decision worker

The worker validates each event against the message contract, then invokes a C++20 decision component asynchronously with a one-second timeout. The component validates magnitude, quality, age, latitude, longitude, and depth. It emits an auditable simulated decision with explicit reason codes. The rules are intentionally simple test rules, not earthquake-warning science.

### Aggregator

The aggregator validates each decision, rejects duplicate and out-of-order revisions through a bounded revision gate, and publishes a simulated alert for the first accepted candidate revision. The revision is committed only after publication succeeds, so a failed publish is retried rather than lost. Services drain on SIGTERM.

### Assurance harness

Three evidence generators run in CI: the C++ scenario harness (`scripts/run-assurance.mjs`), the transport-configuration check (`scripts/verify-transport.mjs`), and the fault-injection integration suite (`scripts/verify-integration.mjs`), which drives the real worker and aggregator against a NATS server through malformed, poison, duplicate, out-of-order, future-dated, restart, and scale-out conditions. Code metrics, coverage, static analysis, sanitizer runs, and an SBOM are produced alongside. Each report carries a commit and a SHA-256 result hash.

### Public evidence site

The static dashboard displays public USGS events, executes safe browser-side simulations, presents the latest assurance report, and documents the control mapping. It does not publish alerts or connect to protected systems.

## Trust boundaries

- Public USGS data is untrusted input and is validated before processing.
- NATS subjects are isolated under the `lab.*` namespace.
- The C++ process receives a constrained argument contract rather than arbitrary JSON.
- Public UI data is read-only and contains no credentials or protected source code.
- CI secrets are never embedded in reports or frontend assets.

## Deployment model

- Static dashboard: GitLab Pages, GitHub Pages, WordPress static page, or CryptoLiveLeak subdomain.
- Verification pipeline: GitLab shared runner or a local runner.
- Full demonstration: Docker Compose on a laptop, or the Ansible playbook (`ansible/site.yml`) on a single Linux host with systemd units bound to loopback.
- Reviewer evidence: exported PDF screenshots, machine-readable report, pipeline URL, commit hash, and repository release tag.
