# Approved Aloia RFQ design — 2026-11-07

The user approved implementation of PostgreSQL event/RFQ uniqueness, per-RFQ serialization,
preserved early cancellations, a separate durable ERP submission record and the existing
canceled item status. All application routes require API key; signed webhook remains signed.
Only quoted lines enter the immutable ERP snapshot. Unknown POST outcomes reconcile instead
of risking duplicate orders. UI loading reflects submission state, not event processing.

Alternatives considered: in-memory locks cannot survive restarts/multiple processes;
an external queue adds infrastructure without removing persistence requirements.

The active implementation plan is [plan.md](../../specs/001-aloia-rfq-reliability/plan.md).
Only its sibling tasks.md tracks progress. See its contracts, research and data model for details.
