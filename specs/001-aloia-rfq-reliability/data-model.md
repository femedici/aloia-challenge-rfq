# Data model

- `rfq`: existing fields; unique rfqId; first serialized creation wins.
- `rfq_item`: existing fields; unique parent + lineNumber; numeric quantity preserves invalid
  fractional input; cancellation reason may be nullable; invalid/canceled are terminal.
- `rfq_event`: primary eventId, rfqId, type, occurredAt, JSON payload, receivedAt, completedAt.
  Claim and state mutation commit atomically; rollback permits safe redelivery. Rows are retained.
- `rfq_submission`: primary rfqId; JSON payload (`ErpOrder`); status
  pending/sending/retry_wait/reconciling/sent/failed; attempts; nextAttemptAt; startedAt;
  completedAt; erpOrderId; lastError; createdAt/updatedAt if useful for current workflow.
  One immutable payload per RFQ. Explicit no-write response permits retry_wait;
  uncertain outcome permits only reconciliation. Sent/failed are terminal.

RFQ mutations and snapshot creation share a transaction advisory lock keyed by rfqId.
ERP worker owns a separate session advisory lock per submission while networking, allowing
committed progress to remain visible and excluding competing workers without long transactions.
