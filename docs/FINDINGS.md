# Findings Log

Independent review of the lab's own 0.2.0 source (engine export commit `b481871`), performed October 7–12, 2026, in the format we use for code-review deliverables: each finding states the defect, how it was found, its consequence, the correction, and the regression evidence that would fail if the defect returned.

Severity scale: **High**, meaning a wrong safety-relevant output or silent data loss; **Medium**, meaning a correctness or availability defect with a plausible trigger; **Low**, meaning maintainability, hardening, or operability.

Before/after evidence: the same fault-injection suite (`scripts/verify-integration.mjs`) was run against the original 0.2.0 worker and aggregator (`evidence/findings/integration-before-fix.json`, **4/9 passed**) and against this release (`public/data/integration-evidence.json`, **9/9 passed**).

| ID | Severity | Area | Status |
| --- | --- | --- | --- |
| CLL-001 | High | Ingestion / input validation | Fixed, regression-tested |
| CLL-002 | High | Aggregator duplicate suppression | Fixed, regression-tested |
| CLL-003 | High | Aggregator ordering of commit vs. publish | Fixed, unit-tested |
| CLL-004 | High | Redelivery exhaustion / message loss | Fixed, regression-tested |
| CLL-005 | Medium | Horizontal scaling | Fixed, regression-tested |
| CLL-006 | Medium | Unbounded memory | Fixed, unit-tested |
| CLL-007 | Low | Shutdown behavior | Fixed, exercised |
| CLL-008 | Low | Configuration drift | Fixed |
| CLL-009 | Medium | Event-loop blocking | Fixed |
| CLL-010 | Low | Complexity | Fixed, metric-gated |
| CLL-011 | Low | Container hardening | Fixed |

---

## CLL-001: Ingestion coerced missing fields into valid values (High)

**Original location:** `services/ingestor.mjs` `normalize()` and `services/decision-worker.mjs`.

**Defect:** `Number(null)` is `0` in JavaScript, and a missing event time was replaced with the feed's generation time. Fed crafted GeoJSON features, the original pipeline:
- turned a **null depth** into 0 km and **published a simulated alert**;
- turned a **missing event time** into the ingest time, revision 0, and **published a simulated alert**;
- turned a **null magnitude** into 0, reported as `below_test_threshold` rather than as malformed input.

The worker also clamped future timestamps to zero age, so a future-dated event was treated as maximally fresh. These behaviors contradict the stated design principle "fail closed on malformed input."

**How found:** adversarial fixtures served through a local feed during the October 7 review.

**Correction:**
- `services/lib/event-contract.mjs` rejects any field that is not already a finite number, and never fabricates a time.
- The ingestor counts and logs rejections per reason, and one bad feature no longer aborts the batch.
- The worker validates every event against the contract, dead-letters violations, and passes negative ages to the engine, which returns `input_out_of_range`.

**Regression evidence:**
- `tests/event_contract.test.mjs`
- Integration scenarios `fail_closed_ingestion`, `invalid_event_dead_lettered` and `future_timestamp_rejected`. The last two fail against 0.2.0.

## CLL-002: Revision 0 was treated as "unknown" (High)

**Original location:** `services/aggregator.mjs`, `latestRevision.get(id) || -1`.

**Defect:** a stored revision of `0` is falsy, so it read back as `-1` and an identical revision-0 decision was accepted again. Replaying the same decision with a new message ID, as happens after the two-minute duplicate window, produced **two simulated alerts for one event revision**. JetStream's duplicate window masked this in short runs.

**Correction:** `services/lib/revision-gate.mjs` treats only `undefined` as unknown.

**Regression evidence:** `tests/event_contract.test.mjs`, and integration scenario `revision_zero_replay` (0.2.0: two alerts; now: one).

## CLL-003: Revision committed before the alert was published (High)

**Original location:** `services/aggregator.mjs`.

**Defect:** the aggregator recorded the new revision and then published. If the publish failed, the message was naked and redelivered, judged a duplicate of the revision just recorded, acknowledged, and **the alert was lost**.

**Correction:** `check()` is read-only, and `commit()` runs only after the publish succeeds.

**Regression evidence:** the unit test "check does not mutate state". A broker-side publish-failure injection is not yet automated.

## CLL-004: Messages were silently dropped after three failed deliveries (High)

**Original location:** the worker and aggregator error handlers (`message.nak(1000)` only).

**Defect:** with `maxDeliver: 3`, a message that fails three times is no longer delivered, and nothing recorded it. The October 7 probe confirmed it: three processing errors, then the message disappeared with no decision, log entry, or dead-letter record.

**Correction:** `services/lib/failure-handling.mjs`. On the final attempt, the consumer publishes a dead-letter record to `lab.deadletter.<consumer>` and terminates the message. The record holds the reason, stream sequence, delivery count, and the original payload in base64. Contract violations are dead-lettered immediately, because retrying cannot succeed.

**Regression evidence:** integration scenario `poison_message_bounded_redelivery`. It requires exactly three attempts and a dead-letter record with the preserved payload; under 0.2.0 it times out with no record.

## CLL-005: A second worker replica could not start (Medium)

**Original location:** `durableConsumerOptions()` in `services/nats-client.mjs`.

**Defect:** the durable push consumer had no queue group. Starting a second replica, for example with `docker compose --scale decision-worker=2`, failed at startup with `Error: duplicate subscription`. The October 7 review note predicted double processing instead. The fault-injection run showed the actual failure mode, and this entry records the corrected observation.

**Correction:** consumers bind to a queue group named after the durable, so replicas share the work.

**Regression evidence:** integration scenario `queue_group_scale_out`. Two replicas, 20 events, exactly 20 engine executions.

## CLL-006: The aggregator's revision map grew without bound (Medium)

**Correction:** the `RevisionGate` capacity defaults to 10,000 and can be set with `REVISION_CAPACITY`, with least-recently-updated eviction. The trade-off is documented: a revision for an evicted event is treated as new.

**Regression evidence:** the unit test "memory is bounded".

## CLL-007: No graceful shutdown (Low)

**Defect:** SIGTERM killed services mid-message, so in-flight messages waited out the five-second ack-wait before redelivery.

**Correction:** `drainOnSignal()` drains the connection on SIGTERM and SIGINT. Docker and systemd send SIGTERM.

**Evidence:** integration scenario `worker_restart_resumes` stops the worker with SIGTERM, publishes, restarts it, and observes the event processed. Durable resume also worked in 0.2.0. Recovery after a hard crash (SIGKILL) is not yet measured.

## CLL-008: Stream configuration drift was ignored (Low)

**Defect:** if the `LAB` stream already existed with different limits, the services silently used them.

**Correction:** the enforced limits are compared on startup, and drift is logged and corrected.

## CLL-009: Synchronous engine invocation blocked the event loop (Medium)

**Defect:** `spawnSync` blocked all message handling, including acknowledgements for other in-flight messages, for up to one second per event.

**Correction:** the engine is now invoked asynchronously with `execFile`, a one-second timeout, a 4 KiB output cap, and a check of the output contract. This removes the blocking. It is not a hard-real-time architecture, and no latency guarantee is claimed.

## CLL-010: `main()` exceeded the complexity threshold (Low)

**Defect:** lizard measured cyclomatic complexity 19 for `main()` in `cpp/alert_decision.cpp`, above the review threshold of 15.

**Correction:** range validation and decision logic were moved into separate functions, and the named constants replace magic numbers. The maximum complexity is now 4 in the C++ and 14 overall. Behavior is byte-for-byte unchanged: the assurance evidence hash is identical before and after (`872e65f6…`), and the C++/JavaScript parity tests pass. Branch coverage rose from 90% to 100%.

**Regression evidence:** `scripts/code_metrics.py` fails CI if any function exceeds 15.

## CLL-011: Container ran as root (Low)

**Correction:** the runtime image copies only the services, dependencies, and engine binary, and runs as the unprivileged `node` user.

---

## Open items (not yet demonstrated)

- Hard-crash (SIGKILL) recovery and replay from a fixed stream sequence.
- Automated broker-side publish-failure injection for CLL-003.
- Sustained-load throughput and latency histograms.
- Persisting aggregator state across restarts. Revision state is still in memory, and after a restart only the JetStream duplicate window protects against re-alerting.
- Authentication and TLS on NATS. The broker binds to loopback only and is not suitable for exposure.
