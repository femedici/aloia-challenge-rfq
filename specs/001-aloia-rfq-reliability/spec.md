# Feature Specification: Aloia RFQ reliability

**Feature Branch**: `agent/aloia-rfq-reliability`
**Created**: 2026-11-07
**Status**: Approved for implementation; verification pending
**Input**: Attached “spec - aloia test”, all primary and secondary requirements,
plus the repository SPEC.md and README.md. Preserve existing architecture and scope.

## Clarifications

### Session 2026-11-07
- Q: Use Spec Kit 1.0.3 and initialize this repository? → A: Use Spec Kit; initialize.
- Q: Which principles govern the constitution? → A: Focus on the attached user spec.
- Q: Approve PostgreSQL persistence, existing canceled status and distinct webhook/ERP records? → A: Approve and implement.
- The original private template disables forks. A private copy preserving the initial Git commit
  was created at femedici/aloia-challenge-rfq, with upstream retained separately.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable event intake (Priority: P1)
As a buyer I receive each RFQ once and retain cancellations regardless of delivery order.
**Why this priority**: Prevent incorrect buying decisions and duplicate requests.
**Independent Test**: Deliver original, duplicate, concurrent, reordered and new-ID resend events.
**Acceptance Scenarios**:
1. Given a new RFQ, when its creation is delivered ten times concurrently, then exactly one RFQ,
   one copy of each line and one event record exist, and all authenticated requests return 2xx.
2. Given a processed event, when it repeats, then no state changes and the response is 2xx.
3. Given an existing RFQ, when another creation event has a different eventId, then original
   customer/items remain unchanged and the new event is acknowledged.
4. Given cancellation before or after creation, when both finish, then final item states match.
5. Given a canceled/invalid item, when quote or no-quote is requested, then return 409 without changes.
6. Given missing fields/wrong types, when a webhook arrives, then return 400 and create no event/RFQ.
7. Given absent/wrong API key or bad signature, then return 401 and create no data.

### User Story 2 - Send quotation once (Priority: P1)
As a buyer I submit a READY RFQ and see its delivery outcome without duplicate ERP orders.
**Why this priority**: Duplicate purchase orders have a direct business cost.
**Independent Test**: Concurrent submissions against the real persistence layer and controlled ERP failures.
**Acceptance Scenarios**:
1. Given READY with quoted/canceled/no_quote/invalid lines, when submitted, then one ERP order
   contains only quoted lines; original detail retains every item.
2. Given a non-READY RFQ with no prior submission, then submit returns 409 without contacting ERP.
3. Given repeated or concurrent submissions, then one durable submission and at most one ERP order exist.
4. Given 422, then show permanent failure and reason without retrying.
5. Given 429 or 503, then retry safely, honor Retry-After, and expose pending/retry status.
6. Given ERP write followed by delayed/lost response, then reconcile and show its existing order ID.
7. Given restart during uncertain delivery, then reconcile instead of issuing another unsafe POST.
8. Given a delivery snapshot, later item changes cannot alter that snapshot or create a second order.

### User Story 3 - Correct domain and protected API (Priority: P2)
As a buyer I see consistent statuses, reliable normalization and exact quotation amounts.
**Why this priority**: These supplied improvements remove observable defects in core rules.
**Independent Test**: Small domain regressions plus HTTP boundary and startup tests.
**Acceptance Scenarios**:
1. Valid calendar dates retain their day under different time zones; nonexistent dates produce a warning.
2. Blacklist entries and item numbers use the same normalization.
3. Quotes round half-up only at the end, including 1.005 -> 1.01 and the SPEC example 35.51 / 106.53.
4. List/detail statuses agree for all combinations, excluding invalid lines from derivation.
5. Invalid quote fields, pagination and startup configuration fail clearly; valid counterparts succeed.

### User Story 4 - Operate and review the feature (Priority: P3)
As a buyer I navigate all RFQs, submit READY quotations and watch delivery progress in an accessible UI.
As a reviewer I can reproduce the result and trace each requested requirement to code and tests.
**Why this priority**: Visual changes follow validated business behavior, as requested.
**Independent Test**: Local browser interactions, responsive viewports, build and README instructions.
**Acceptance Scenarios**:
1. Detail shows not sent, active/retry/reconciliation, sent with ID, and permanent failure with reason.
2. Submit is available only for READY and not already submitted; loading/error feedback is visible.
3. Active delivery refreshes automatically and navigation reaches RFQs beyond the first twenty.
4. Errors and statuses are identifiable by text and keyboard focus, not color alone.
5. The UI uses Aloia Aerospace colors, button treatment and general aesthetic after logic validation.

### Edge Cases
- Cancellation of unknown RFQ/line is retained; existing invalid items remain invalid (both are final).
- Repeated cancellations select reason deterministically by occurredAt then eventId.
- The first successfully serialized creation wins. eventId identifies a delivery globally.
- Domain-invalid numeric quantities/PNs/units remain recorded as invalid items; malformed types are 400.
- A submission freezes the quoted payload. Quote/no-quote edits are rejected after submission starts;
  later customer cancellations remain auditable locally but never modify the ERP order (out of scope).
- Empty GET after an ambiguous POST is not evidence of no write; continue reconciliation and expose
  the reason rather than risk duplicates. This trades automatic recovery for safety on unknown outcomes.
- Multiple ERP orders already present are an integrity failure, never a reason to create another.
- Local data and the fake ERP implementation must not be reset or altered to obtain passing tests.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001** (primary 1): Handle rfq.item_canceled with terminal item status canceled.
- **FR-002** (primary 2): Persist unique event identity, received/completed timestamps; repeated concurrent delivery is 2xx without reapplication.
- **FR-003** (primary 3): First creation for each rfqId wins, including different event IDs.
- **FR-004** (primary 4): Final state is independent of creation/cancellation delivery order.
- **FR-005** (primary 5): Provide POST /rfqs/:rfqId/submit with READY enforcement.
- **FR-006** (primary 6): ERP payload contains only quoted items; retain all source items.
- **FR-007** (primary 7): Concurrent/repeated submits and ERP response failures cannot duplicate orders.
- **FR-008** (primary 8): Detail distinguishes not sent, active/retry, sent with ID, and definitive failure with reason.
- **FR-009** (primary 9): Support documented ERP chaos behavior: 422, 429, 503 and delay after write.
- **FR-010** (primary 10): Show delivery state, READY-only submit, loading and error from persisted submission timestamps/state.
- **FR-011** (primary 11): Refresh the detail while delivery is active.
- **FR-012** (primary 12): Test webhook and ERP idempotency, including concurrency.
- **FR-013** (primary 13): All application endpoints require X-Api-Key; webhook also requires its HMAC signature.
- **FR-014** (primary 14): Correct requested/high-priority defects and document remaining issues, impact and recommendation.
- **FR-015** (secondary 1): Reuse a single RFQ status derivation for list and detail.
- **FR-016** (secondary 2): Normalize blacklist entries before comparison.
- **FR-017** (secondary 3): Calendar-only dates are timezone-independent and real dates.
- **FR-018** (secondary 4): Exact decimal arithmetic and final half-up rounding follow repository SPEC.
- **FR-019** (secondary 5): Runtime payload validation rejects missing fields, wrong types and invalid values clearly.
- **FR-020** (secondary 6): Pagination uses positive integers; pageSize maximum is 100.
- **FR-021** (secondary 7): UI provides pagination beyond its first twenty RFQs.
- **FR-022** (secondary 8): Accessible labels, status text, loading feedback and understandable errors.
- **FR-023** (secondary 9): Useful logs include rfqId/eventId/attempt/result without secrets.
- **FR-024** (secondary 10): Required configuration is validated before accepting requests.
- **FR-025** (secondary 11): Small regression tests cover status, dates, blacklist and prices.
- **FR-026**: Apply https://aloiaaerospace.com/ visual direction after all core logic checks pass.
- **FR-027**: README documents run instructions, trade-offs, assumptions, issues, future work and actual AI use.
- **FR-028**: Version corrected Markdown/XML AGENT.md derived from supplied spec (omit meta-instructions about generating AGENT/README/repository), plus final handoff, short task/code-line report and full additions inventory.

### Key Entities
- RFQ: customer, unique business identity, original creation and derived status.
- RFQ item: unique line, raw/normalized data, warnings, terminal status and quotation.
- Received event: globally unique identity, RFQ, event data and processing timestamps retained permanently.
- ERP submission: one per RFQ, frozen quoted lines, delivery state, attempts, timestamps, ERP ID and error.

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: Every FR-001 through FR-028 maps to implementation/documentation and observed validation evidence.
- **SC-002**: Concurrent repeated event and submission scenarios produce one RFQ and no more than one ERP order.
- **SC-003**: Success and rejection/failure cases cover all implemented business rules; publish measured test coverage and any uncovered lines honestly.
- **SC-004**: API and UI builds pass; local browser verification confirms submission, feedback, polling, pagination and responsive accessibility.
- **SC-005**: Original Git history is preserved in the private copy; complete task changes are committed/pushed on the work branch without merge or deploy.

## Assumptions
- Use existing project technologies and dependencies; no external queue is needed.
- X-Api-Key applies to this application's endpoints, not the unchanged third-party fake ERP protocol.
- The existing Vite proxy keeps the internal key out of browser code; production proxy requirements are documented.
- No finite retries can prove exactly-once external effects after every possible ambiguous network failure;
  reconciliation-only handles unknown outcomes safely under the provided ERP contract.
- Original SPEC.md remains the challenge reference; this document is the live specification of the requested feature.
