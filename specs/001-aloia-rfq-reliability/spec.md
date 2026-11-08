# Feature Specification: Aloia RFQ reliability

**Feature Branch**: `agent/aloia-rfq-reliability`
**Created**: 2026-11-07
**Status**: Initial delivery published; approved UI/list refinement implemented and locally verified, uncommitted on agent/aloia-rfq-review
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

## Verification record — 2026-11-07

- 290 automated backend tests in 9 suites pass; API and frontend builds pass.
- Coverage: 96.52% lines overall; RFQ/ERP 100% lines; domain normalization/pricing/validation 100% lines and branches.
- Real PostgreSQL schemas exercise concurrency, rollback, locks, restart and populated legacy upgrade.
- Live chaos smoke confirms one ERP order each for four submitted RFQs, including UI submission and safe retries.
- Edge checks cover page 2, keyboard focus, READY enforcement, polling, failure recovery, all delivery states and mobile layout.
- Controlled UI responses were separate from the real API/ERP and did not alter application data.
- No implementation gaps found in final independent review. See outputs/aloia-rfq-handoff.md for line references, inventory and limitations.
- Spec Kit convergence checked 28 functional requirements, 25 acceptance scenarios, 5 success criteria, 8 architecture decisions and 5 constitution principles; no gaps or new corrective tasks.
- Complete delivery commit `0f34a6300a8196552064a60eef8f9a7ba53f73ce` was pushed and verified against the remote feature branch; subsequent documentation closure records this evidence.
- Reviewer read-only access remains an external delivery decision: personal private GitHub repositories do not support that role.

## Approved refinement — 2026-11-07

The user approved this design in chat. Initial commits stay untouched; all previous and new changes
must be visible uncommitted against original 2e810cf in a separate VS Code review branch. This
explicit instruction overrides automatic commit/push for this refinement and updates SC-005 accordingly.

- **FR-029**: Use the supplied Aloia logo unchanged and replace Central de cotações with CONTROLE RFQ.
- **FR-030**: Keep the list within the viewport with internal table scrolling and sticky column headers;
  preserve usable filters and pagination, keyboard access and small-screen access without clipping.
- **FR-031**: Move RFQ navigation to an accessible eye action beside status; RFQ ID is plain text.
  Do not invent general RFQ editing: only item quote/no-quote API operations currently exist.
- **FR-032**: Filter all RFQs by partial RFQ ID, customer name/code and quotation status before pagination.
  Sort each visible data column in both directions (RFQ, customer, item count, quotation state),
  with stable ties and validated sort fields. Changing filters/order resets page 1; back from detail preserves them.
- **FR-033**: Use one Cotação column with no separate ERP column (latest user adjustment). Display “Cotação enviada ao ERP” only for confirmed sent delivery. With not_sent, retain the quotation label, including READY = “Pronta para envio”; other delivery states show progress/failure. Keep the domain states separate internally and explain the READY filter covers ready or sent quotes. CLOSED without delivery remains reddish; canceled is an item state. OPEN never means sent; READY and sent may coexist.
- **FR-034**: Manual Consultar situação shows loading, success with refresh time, and failure feedback.
  Polling must not generate success notifications or silently claim success when a request fails.
- **FR-035**: Provide architecture TXT covering entities/keys/relations, transactional webhook ledger,
  observable ERP processing state, quotation formula/API and simulated ERP; no quotation form is implied.
- **FR-036**: Open review branch in VS Code with complete prior/new diff against original and no new commits,
  preserving original published branch/history. Run the review app locally and document exact location.

### Refinement acceptance
1. RFQ/customer/status filters combine across pages; no match shows an empty state and reset control.
2. Each data column sorts ascending/descending globally; invalid query/sort values return 400.
3. At desktop and phone sizes, list rows scroll within the table, headers/actions remain available,
   logo and CONTROLE RFQ appear, eye action works with keyboard and ID is not the navigation link.
4. READY + sent displays “Cotação enviada ao ERP” in Cotação, without an ERP column; READY + not_sent remains “Pronta para envio”. Active/failure states never claim confirmed delivery; CLOSED without submission retains red treatment.
5. Manual refresh visibly progresses to success or error; automatic polling does not emit manual notices.
6. TXT correctly distinguishes event transaction completion from durable ERP progress and describes
   current API-only quotation; review HEAD remains original, staged content empty, prior branch unchanged.

## Refinement verification record — 2026-11-07

- 322 automated tests in 12 suites pass; API and web builds pass.
- Current backend coverage: 96.70% lines / 97.24% branches; RFQ and ERP have 100% lines.
- 24 new PostgreSQL list tests cover global filters/order, validation, status parity and read-snapshot concurrency.
- 8 frontend boundary/state tests cover query parameters, navigation state and real QueryObserver completion/error/cancellation behavior.
- Edge verifies combined/empty filters, both order directions, page/back preservation, keyboard eye navigation, sticky header, internal scrolling, desktop and 390×844 mobile.
- Real API refresh success and isolated loading/error/retry/polling checks pass. The reproduced query/mutation race is fixed by excluding simultaneous actions; the independent reviewer verified the fix.
- Logo matches the supplied bytes. Architecture TXT verified against actual entities and services.
- Final convergence checked 36 FR, 31 acceptance scenarios, 5 SC (including explicit no-commit override), the 8 original architecture decisions plus 5 refinement execution decisions, and 5 constitution principles: zero missing/partial/contradictory/unrequested findings; no corrective tasks appended.
- Review HEAD remains original 2e810cf; content staged is empty; published checkout remains clean at efe2cd1. VS Code shows the Working Tree diff on agent/aloia-rfq-review.
- Local UI 5174 and its API/database query through the proxy returned 200 after validation. Existing application data/ERP were preserved.
- See outputs/aloia-rfq-ui-review-handoff.md for files, evidence and limits.

## Single-column adjustment verification — 2026-11-07

- User explicitly requested removal of the ERP column and “Cotação enviada ao ERP”. FR-032/033 and refinement acceptance 4 reflect this superseding presentation choice.
- The display uses confirmed submission state; READY/not_sent does not claim delivery. Progress/failure stays visible in Cotação. The detail heading uses the same label.
- 15 focused frontend tests pass after observing 7 RED cases; web TypeScript/Vite build and diff check pass.
- Browser verified 5 columns, sent wording and order SO-1005 in detail, READY filter with ready/sent wording, and 390×844 viewport with page height/width equal to viewport.
- T017 convergence: changed requirements and acceptance are satisfied; no corrective work remains. Backend API/domain were not changed; the earlier full-suite/coverage record is historical, not a new measurement for this adjustment.

## Approved reviewer demo — 2026-11-08
- FR-037: Local demo startup creates RFQ-DEMO-OPEN, PARTIAL, READY, MIXED, CLOSED and INVALID with the approved item states. READY and MIXED have no submission and can be sent manually. No automatic ERP submission.
- FR-038: Demo mode is explicit in .env.example, disabled when absent and forbidden in production. Repeated/concurrent startup preserves existing RFQs, edits and submissions. Each scenario is atomic; a failed initialization is retryable. DEMO_ROUND optionally adds a stable suffix for new examples without resetting history.
- FR-039: README documents startup, each RFQ, manual sending, new rounds, webhook commands and isolated automated tests; tests prove allowed/blocked submissions and preservation.

## Approved integration and documentation — 2026-11-08

- The user now explicitly authorizes committing the reviewed changes, merging them with the concise README/PDF/architecture, and publishing the result to the principal branch of their repository. This supersedes the earlier no-commit review restriction (FR-036 and the temporary SC-005 override).
- The review's application behavior, filters, quotation presentation and demo scenarios remain authoritative. The concise README incorporates their current usage instructions and references the unchanged supplied `docs/passos_desafio.pdf` and `docs/arquitetura_aloia.png`.
- The user's removal of old generated plans, screenshots and handoffs is preserved. The supplied architecture image replaces the former TXT/Excalidraw deliverables as the current architecture reference (superseding the documentation format in FR-035). A fresh integration handoff records current evidence; historical validation entries above remain historical.
- `origin` is `femedici/aloia-challenge-rfq`; neither main nor master existed remotely at inspection. Publish the complete integrated version on `main`. Do not push to `upstream`, change repository visibility/access, rewrite history or remove worktrees.

### Integration verification record

- Review and integrated snapshots both passed 347 tests in 13 suites plus API/web builds. 111 review files match byte-for-byte; attachments match the supplied originals. Original SPEC and fake ERP remain unchanged.
- Browser checks confirm the reviewed filters, detail navigation, READY send availability and manual refresh success. API/UI/proxy return 200. Existing data and ERP history were preserved.
- Merge `e75de7a13fa4f68406df819dd1edbe06d352efc5` was published to origin/main and the reliability branch; remote refs matched the local commit. GitHub confirmed the default branch changed to main, and remote HEAD resolves to main.
- T020 is complete. The current integration record is `outputs/aloia-main-handoff.md`; the final documentation closure follows the verified merge without source changes.

## Development steps format — 2026-11-08

- At the user's request, `docs/passos_desafio.md` replaces the PDF as the current development steps reference. Its complete text matches the original two-page PDF after removing formatting and joining wrapped lines.
- README links point to Markdown; the PDF is removed from the current tree. The architecture image is unchanged. The link to the integration handoff removed by the user in `05c5509` is also removed; no handoff file is recreated.
- Documentation-only change: verify content parity, local links and Git diff; application tests/builds are not rerun.

## Original local address restored — 2026-11-08

- README uses `npm --prefix web run dev` and `http://localhost:5173`, as requested. Existing Vite defaults already select localhost and port 5173; no application or configuration changes are necessary.
- Only the root Vite server was restarted. Vite reported the requested URL; the interface and proxied RFQ list returned HTTP 200. API, database and ERP processes were preserved.
