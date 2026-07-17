# 06 — Deliver the report from a pull request

**What to build:** Turn an authenticated pull-request event into an idempotent report job and one updated GitHub comment linking to the progressive report.

**Blocked by:** 05 — Publish reports progressively.

**Status:** complete

- [x] Invalid webhook signatures are rejected without queuing work.
- [x] Supported pull-request actions create a job keyed by repository, number, and head revision.
- [x] Re-delivery of the same revision does not create duplicate work.
- [x] A marker-bearing Gist comment is created once and updated on later revisions.
