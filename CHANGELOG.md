# Changelog

## 0.4.0 — 2026-10-12
- Unified repository: C++ engine, NATS services, dashboard, WordPress plugin and theme, docs, CI.
- Fixed findings CLL-001 to CLL-011 (see docs/FINDINGS.md): fail-closed ingestion and validation, revision-0 duplicate alerts, commit-before-publish loss, silent loss after maximum deliveries (now dead-lettered), queue-group scale-out, bounded revision memory, graceful drain, stream-config drift, non-blocking engine calls, C++ complexity refactor (output unchanged; evidence hash identical), non-root container.
- Added the fault-injection integration suite against a real NATS server (9 scenarios; 4/9 passed on 0.2.0, 9/9 now).
- Added code metrics (LOC, cyclomatic complexity, Halstead), sanitizer runs, SBOM and audit, and an Ansible playbook with ansible-lint at production profile.
- GitHub Actions and GitLab CI pipelines; the GitLab coverage job now installs the LLVM profiling runtime.
- Dashboard shows integration evidence and links to the repository and CI runs.
- License: Apache-2.0 for the repository; the WordPress plugin and theme remain GPL-2.0-or-later.

## 0.3.0 — 2026-10-07
- Moved the site to assurance-lab.cryptoliveleak.com; theme forces a neutral document title and description so the lab never presents under an agency program name.
- Removed internal planning documents from the public plugin bundle (they were web-accessible under the plugin's assets path).
- Renamed "Public feed" to "USGS catalog" and explained on screen why catalog events are suppressed as `stale_event`.
- Added an in-browser mutation check demonstrating that the fault tests fail against a broken policy.
- Added optional source-repository and pipeline links (`data/links.json`, GitHub/GitLab URLs only).
- Replaced the public "proposal evidence gap" card with a source-and-verification card.
- Added Node test suite (boundary, fault, mutation, normalization, public-bundle guards), PHP lint, packaging script, GitHub Actions and GitLab CI.

## 0.2.0 — 2026-10-06
- Initial WordPress plugin and theme packaging of the reviewer dashboard.
