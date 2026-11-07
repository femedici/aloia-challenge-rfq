# API and implementation contracts

All application routes require X-Api-Key. POST /webhooks/rfq additionally requires HMAC
X-Signature over the raw body. Authentication failure 401; malformed payload 400;
unknown RFQ/item 404; forbidden transition/submit 409.

- POST /webhooks/rfq: existing rfq.created or rfq.item_canceled; 200 {ok:true}, also on duplicates.
- GET /rfqs?page=1&pageSize=20: retain existing summary array response; page/pageSize positive
  safe integers, pageSize <=100. UI can request next page; empty last page has usable Back.
- GET /rfqs/:rfqId: existing fields/items/status plus `submission`:
  {status: not_sent|pending|sending|retry_wait|reconciling|sent|failed, attempts,
  startedAt, completedAt, nextAttemptAt, erpOrderId, lastError}. Null timestamps/IDs as applicable.
- PUT /rfqs/:rfqId/items/:lineNumber/quote and POST .../no-quote: preserve existing contract;
  reject mutation of terminal items and after a submission has frozen the quotation.
- POST /rfqs/:rfqId/submit: 202 with submission status for accepted/existing active request;
  200 for already terminal request; non-READY without existing submission ->409.
  Return existing submission on repeats even if a later cancellation changes derived RFQ status.

## Writer boundaries

Domain agent owns src/common/normalize.ts, price.ts, validation.ts, src/rfq/rfq.types.ts,
and test/domain.test.ts plus existing normalize.test.ts as needed. Export interfaces
RfqCreatedEvent, RfqCanceledEvent, RfqEvent, QuoteInput from rfq.types.ts. Export
validateWebhookEvent(value:unknown): asserts value is RfqEvent,
validateQuoteInput(value:unknown): asserts value is QuoteInput, validatePagination(page,pageSize):void.
Export calculateQuote(quantity:number,input:QuoteInput): {unitPriceUsd:string,totalPriceUsd:string}.

ERP agent owns src/erp/** and test/erp*.test.ts only. Export RfqSubmission entity with
fields in data-model.md from src/erp/rfq-submission.entity.ts; expose worker through ErpModule.
Coordinator inserts pending submission within RFQ transaction using TypeORM repository,
with rfqId and payload; entity defaults supply initial attempts/state/timestamps.
Worker polls durable due rows automatically at startup, serializes per RFQ using a dedicated
queryRunner session lock, persists sending BEFORE POST and updates committed state after.
Worker methods used by its timer may be invoked directly by tests; avoid test-only production APIs.
Existing ErpClient createOrder remains usable; add lookup, typed status errors, bounded HTTP timeout.

Coordinator owns remaining src/rfq/**, app/main/config/guard, test/rfq*.test.ts,
test/database.ts, scripts and all tracked documentation. No other writer edits these files.
Front-end starts only after core integration passes.
