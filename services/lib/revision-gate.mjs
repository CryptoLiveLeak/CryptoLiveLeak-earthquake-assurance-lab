// Bounded per-event revision tracking for the aggregator.
// FINDING CLL-002: the previous `map.get(id) || -1` treated a stored revision 0 as unknown,
// so a replayed revision-0 decision produced a second simulated alert. `undefined` is now
// the only "unknown" value.
// FINDING CLL-006: the previous Map grew without bound. This gate evicts the least recently
// updated event once `capacity` is reached. Eviction is a documented trade-off: a revision
// for an evicted event is treated as new. Capacity should exceed the number of events that
// can be active within the stream's duplicate window and retention period.
export class RevisionGate {
  /** @param {number} capacity Maximum tracked events before least-recently-updated eviction. */
  constructor(capacity = 10_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    this.capacity = capacity;
    this.revisions = new Map();
    this.evictions = 0;
  }

  /** Read-only check. Returns "accepted", "duplicate_revision", or "out_of_order_revision". */
  check(eventId, revision) {
    const known = this.revisions.get(eventId);
    if (known === undefined || revision > known) return "accepted";
    return revision === known ? "duplicate_revision" : "out_of_order_revision";
  }

  /** Record a revision. Call only after downstream publication has succeeded (FINDING CLL-003). */
  commit(eventId, revision) {
    const known = this.revisions.get(eventId);
    if (known !== undefined && revision <= known) return false;
    this.revisions.delete(eventId);
    this.revisions.set(eventId, revision);
    if (this.revisions.size > this.capacity) {
      this.revisions.delete(this.revisions.keys().next().value);
      this.evictions += 1;
    }
    return true;
  }

  get size() { return this.revisions.size; }
}
