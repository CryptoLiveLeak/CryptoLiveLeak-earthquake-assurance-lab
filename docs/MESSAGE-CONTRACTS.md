# Message Contracts

Enforced in code by `services/lib/event-contract.mjs` and covered by `tests/event_contract.test.mjs`. All subjects live in the bounded `LAB` stream (`lab.>`).

## `lab.events.normalized`

Produced by `services/ingestor.mjs`. Validated again by the decision worker before the engine runs.

| Field | Type and rule |
| --- | --- |
| schemaVersion | Must equal `1` |
| eventId | Non-empty string, at most 200 characters |
| sourceRevision | Non-negative safe integer: USGS `updated`, or `time` when `updated` is absent |
| observedAt | ISO-8601 string from the source event time. Never fabricated. |
| receivedAt | ISO-8601 ingest time |
| magnitude, latitude, longitude, depthKm | Finite numbers taken as-is from the source. Null, missing, or string values are rejected, never coerced. |
| quality | Illustrative: 0.95 for reviewed status, otherwise 0.75. Not a USGS uncertainty measure. |
| source | Fixture or feed label |
| eventKey | SHA-256 of `eventId:sourceRevision`. The worker recomputes and checks it. |

Message ID: `event:<eventKey>`. Ingestion rejection reasons are `invalid_event_id`, `missing_event_time`, `missing_magnitude`, `missing_coordinates`, `missing_depth` and `invalid_revision`.

## `lab.decisions`

Produced by the decision worker: `schemaVersion`, `eventId`, `eventKey`, `sourceRevision`, `decidedAt`, `candidate` (boolean), `reason` (string), `score` (number). On engine failure the worker also adds `detail`. Message ID: `decision:<eventKey>`.

Reason codes:
- **From the C++ component:** `input_out_of_range` (which includes negative ages from future timestamps), `stale_event`, `insufficient_quality`, `test_threshold_met`, `below_test_threshold`.
- **From the worker:** `engine_failure`, covering a timeout, a nonzero exit, or output that violates the contract.

The aggregator validates `eventId`, `sourceRevision`, `eventKey`, `candidate` and `reason` before using a decision.

## `lab.alerts.simulated`

Published by the aggregator for the first accepted candidate revision of an event. It contains the decision fields plus `simulationOnly: true` and `publishedAt`. Message ID: `simulated-alert:<eventKey>`. No notification to the public, FEMA, IPAWS, WEA, or USGS exists in this code.

## `lab.deadletter.<consumer>`

Written by a consumer in two cases: when a message violates the contract (`invalid_event` or `invalid_decision`), or when a message fails on its final delivery (`max_deliveries_exhausted`). Fields: `consumer`, `reason`, `detail`, `originalSubject`, `streamSequence`, `deliveryCount`, `deadLetteredAt`, `payloadBase64`. Message ID: `deadletter:<consumer>:<streamSequence>`.

## Durability settings

| Setting | Value |
| --- | --- |
| Stream limits | 100,000 messages, 512 MiB, 24-hour age, two-minute duplicate window, discard oldest. Drift is corrected at startup. |
| Consumers | Durable, explicit ack, 5-second ack wait, maximum 3 deliveries, 1-second retry delay, 64 pending acks, queue group named after the durable |
| Aggregator revision memory | In-process, bounded with least-recently-updated eviction. Not persisted across restarts. |
