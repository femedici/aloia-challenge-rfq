# Decisions and evidence

- **Decision:** database uniqueness and per-RFQ transaction locks. **Rationale:** current
  find-before-save races and has no unique rfqId. **Alternatives:** memory locks fail across
  processes/restarts; external queue adds infrastructure and still needs uniqueness.
- **Decision:** retain cancellation payload in the event ledger. **Rationale:** cancellation
  is terminal, so replay on creation makes order irrelevant without a second tombstone table.
- **Decision:** durable submission row with frozen payload and processing timestamps.
  **Rationale:** webhook completion and later buyer/ERP workflow are different lifecycles.
- **Decision:** only explicit 429/503 allow automatic repost; uncertain results reconcile.
  **Rationale:** fake-erp/server.mjs records before delayed response and externalId is not unique.
  Empty lookup cannot prove a prior in-flight request will never commit.
- **Decision:** keep canceled status and require application-wide API key plus webhook HMAC.
  **Rationale:** user approved this contract on 2026-11-07.
- **Decision:** exact base-10 arithmetic using BigInt. **Rationale:** current floating-point
  toFixed gives 1.00 for 1.005. Native arithmetic avoids an additional dependency.
- **Observed baseline:** 3 tests pass; API and web builds pass; database has rfq/rfq_item and zero RFQs.
  Audit reproduced timezone day shift, impossible date acceptance, blacklist mismatch and fail-open key.
