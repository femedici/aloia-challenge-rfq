# Tasks: Aloia RFQ reliability

Only the coordinator updates this tracker. Completion requires diff review and executed validation.
Each implementation task uses RED -> GREEN -> review; task status remains in_progress until integrated.

## Phase 1: Setup and foundation
- [x] T001 Establish private history-preserving copy, approved design and Spec Kit artifacts in `.specify/`, `specs/001-aloia-rfq-reliability/`, `docs/plans/2026-11-07-aloia-rfq-design.md`.
  - Status: done; agent: root; dependencies: none; requirements: SC-005.
  - Acceptance: private destination verified, baseline preserved, all spec items mapped.
  - Verification: GitHub private badge; remote branch 2e810cf; baseline 3 tests/API build/web build pass.
  - Blocker: none; next: create isolated writer worktrees from this documentation baseline.

## Phase 2: User story 1 — event reliability
- [x] T002 [P] [US1] Implement transactional webhook ledger, uniqueness and cancellation ordering in `src/rfq/` (excluding rfq.types.ts) with `test/rfq-events.test.ts` and `test/database.ts`.
  - Status: done; agent: root; dependencies: T001; requirements: FR-001–004, FR-012, FR-015, FR-023.
  - Acceptance: concurrent/repeated event returns 2xx once, first creation wins, reordered cancellation persists, shared status agrees, no terminal item revival.
  - Verification: `npm test -- --runInBand test/rfq-events.test.ts`; real PostgreSQL concurrency and rollback tests.
  - Evidence: populated legacy migration preserves IDs, quantities and quotations; 11 PostgreSQL event tests pass after observed RED; full current suite 39 tests and API build pass. Coordinator reviewed diff.
  - Blocker: none; next: integrate domain and ERP work.

## Phase 3: User story 2 — ERP delivery
- [x] T003 [P] [US2] Build durable delivery and ERP error/reconciliation handling in `src/erp/**` and `test/erp*.test.ts`.
  - Status: done; agent: erp_delivery; dependencies: T001; requirements: FR-007–009, FR-012, FR-023.
  - Acceptance: durable state, serialized workers, 422 permanent, 429/503 safe retry, uncertain outcome reconciliation, restart and duplicate protection.
  - Verification: targeted ERP Jest suites with real PostgreSQL and local HTTP servers; `npm run build`.
  - Evidence: coordinator reviewed and integrated 360dffc; 39 ERP tests and build pass; independent reviewer found no defects.
  - Blocker: none; next: integrated submit validation.
- [x] T004 [US2] Integrate submit snapshot and detail delivery state in `src/rfq/rfq.service.ts`, `rfq.controller.ts`, `rfq.module.ts` and `test/rfq-api.test.ts`.
  - Status: done; agent: root; dependencies: T002,T003,T005; requirements: FR-005–008, FR-012.
  - Acceptance: READY-only first submit, one immutable quoted-only payload, repeated submit returns existing state, all detail items retained.
  - Verification: concurrent HTTP submits, non-READY 409, late cancellation, atomic snapshot/quote races.
  - Evidence: 26 API integration tests pass, including concurrent submit and snapshot immutability.
  - Evidence: coordinator verified 32 API tests, including INVALID/CLOSED, snapshot/quote locks, route bounds and 404 after submission. Both independent review findings reproduced RED and fixed GREEN.
  - Blocker: none; next: UI verification.

## Phase 4: User story 3 — domain correctness and security
- [x] T005 [P] [US3] Fix normalization/dates/pricing and validate payloads in `src/common/normalize.ts`, `price.ts`, `validation.ts`, `src/rfq/rfq.types.ts`, `test/domain.test.ts`, `test/normalize.test.ts`.
  - Status: done; agent: domain_rules; dependencies: T001; requirements: FR-016–020, FR-025.
  - Acceptance: original data preserved, exact half-up example and ties, real dates independent of timezone, normalized blacklist, clear runtime validation.
  - Verification: domain/normalization Jest tests for valid/invalid inputs and monetary boundaries; build.
  - Evidence: coordinator reviewed and integrated 5bf01e2 and 9bd167e; 177 tests and build pass. Domain helpers have 100% coverage.
  - Blocker: none; next: integrated API verification.
- [x] T006 [US3] Integrate API-wide authentication, validated startup, payload helpers and pagination in `src/common/api-key.guard.ts`, `config.ts`, `src/main.ts`, `src/app.module.ts`, RFQ controllers/service, `scripts/send-webhooks.mjs`, `test/security.test.ts`.
  - Status: done; agent: root; dependencies: T002,T005; requirements: FR-013, FR-019–020, FR-024–025.
  - Acceptance: missing/wrong key fails every route, HMAC remains required, malformed payload 400, missing config fails before listen.
  - Verification: HTTP security matrix, startup tests, domain/HTTP integration and builds.
  - Evidence: authentication matrix and startup validation pass (28 tests combined); payload/pagination integration pending T005.
  - Evidence: validators wired; 281 backend tests pass; all routes, including webhook/submit, require the API key.
  - Evidence: 290 tests pass, API build passes, RFQ logic and ERP have 100% line coverage.
  - Blocker: none; next: UI verification.

## Phase 5: User story 4 — interface after core validation
- [x] T007 [US4] Implement submission controls, polling, pagination, accessible feedback and Aloia styling in `web/src/`.
  - Status: done; agent: domain_rules (UI) + root (browser); dependencies: T004,T006; requirements: FR-010–011, FR-021–022, FR-026.
  - Acceptance: all delivery states visible, READY-only action, loading/errors, no key in bundle, usable keyboard/narrow/wide layouts.
  - Verification: web build and real local browser workflow, page 2 navigation, polling and failure feedback.
  - Evidence: core passed before UI began; actual Aloia homepage inspected (navy/orange rectangular CTA). Writer uses isolated agent/aloia-rfq-ui worktree.
  - Evidence: root integrated/reviewed 1ae0e41,09b92df,dbba15c; web build passed; Edge verified page2, keyboard focus, READY submit, real SO-1004, polling, errors, all 7 delivery states, uncertain-submit retry, 390px layout (375px client/scroll width).
  - Blocker: none; next: final convergence.

## Phase 6: Convergence, evidence and delivery
- [x] T008 Run comprehensive validation/convergence and close verified gaps in `test/`, feature artifacts and affected source.
  - Status: done; agent: root + independent reviewer; dependencies: T004,T006,T007; requirements: FR-001–026, SC-001–004.
  - Acceptance: every rule has positive/negative evidence, real concurrent/chaos tests pass, measured coverage reported, browser verified.
  - Verification: full Jest with coverage, API/web builds, live smoke, independent diff review, speckit-converge.
  - Evidence: 290 tests/9 suites, API and web builds, live chaos and Edge scenarios pass. Final reviewer found no material defect; source-to-requirement matrix completed.
  - Evidence: final Spec Kit convergence checked 28 FR, 25 acceptance scenarios, 5 SC, 8 architecture decisions and 5 constitution principles; zero gaps and zero new tasks.
  - Blocker: none; next: none within implementation scope.
- [x] T009 Write final `README.md`, corrected `AGENT.md` and `outputs/aloia-rfq-handoff.md`, including every requirement/code line and additions inventory.
  - Status: done; agent: root + erp_delivery (README); dependencies: T008; requirements: FR-014, FR-027–028, SC-001.
  - Acceptance: reproducible instructions, actual decisions/AI use, remaining issues/impact/recommendation, new files/entities/tables/endpoints and risks.
  - Verification: reread requirements against final diff, check cited file lines and commands.
  - Evidence: corrected AGENT.md drafted; README delegated in isolated agent/aloia-documentation worktree. Root owns handoff/inventory.
  - Evidence: README reviewed and integrated; AGENT and 28-row handoff matrix written with all 62 new files, tables/entities/endpoint inventory; local links and shell syntax pass.
  - Evidence: publication verified at 0f34a6300a8196552064a60eef8f9a7ba53f73ce and recorded in the handoff; reviewer access limitation is explicit.
  - Blocker: none; next: none within documentation scope.
- [x] T010 Commit and push complete verified feature branch and leave local API/UI available for testing.
  - Status: done; agent: root; dependencies: T009; requirements: SC-005.
  - Acceptance: clean in-scope commits, remote HEAD matches, local URLs verified, no remote merge/deploy/worktree cleanup.
  - Verification: git status/log/ls-remote and fresh local readiness/browser checks.
  - Evidence: clean local tree and origin feature branch both at 0f34a6300a8196552064a60eef8f9a7ba53f73ce; original commit remains an ancestor; all 62 new files included. Authenticated API and UI respond 200; RFQ-DEMO-022 READY/not_sent is available for user testing.
  - Blocker: none for branch publication; next: reviewer read-only access requires a separate destination/permission decision documented in the handoff.

## Dependencies and parallel execution
T002 (RFQ), T003 (ERP) and T005 (domain) use disjoint files and separate writer worktrees from
one common baseline. Root alone integrates each branch and updates status. T004/T006 converge
these components. UI waits for core verification; documentation and final publish follow validation.

## Phase 7: Approved list refinement and original comparison
- [x] T011 Inspect actual architecture, approve design and prepare uncommitted VS Code review.
  - Status: done; agent: root; dependencies: T010; files: feature spec/plan/tasks and review worktree.
  - Acceptance: design approved, original and previous delivery preserved, all prior changes visible.
  - Verification: review HEAD 2e810cf; previous delivery efe2cd1 unchanged; git diff --cached empty; code CLI opened review.
  - Blocker: none; next: implement approved disjoint tasks. No new commits/push per latest user request.
- [x] T012 [P] Add global list filtering, ordering and ERP summary state.
  - Status: done; agent: erp_delivery; dependencies: T011; files: src/rfq/rfq.service.ts, rfq.controller.ts, src/common/validation.ts, test/rfq-list.test.ts (and test/rfq-api.test.ts only if needed).
  - Acceptance: filters combine across pages, every data-column sort supports both directions, stable ties,
    quote status matches detail, query values validated, summary response stays an array with submissionStatus.
  - Verification: targeted PostgreSQL HTTP RED/GREEN tests and API build.
  - Evidence: root reviewed/applied the isolated diff; 24 PostgreSQL list tests plus 32 API tests pass. All state combinations and concurrent page hydration covered; full suite 322 tests and API build pass.
  - Blocker: none; next: final closure in T015.
- [x] T013 [P] Implement logo, viewport table, controls, status clarity and manual refresh feedback.
  - Status: done; agent: domain_rules; dependencies: T011; files: web/src/**, web/public/aloia-logo.png, targeted UI tests.
  - Acceptance: FR-029–034; all requested visible controls accessible; no general RFQ edit action invented.
  - Verification: meaningful behavior regressions, web build; root browser verifies desktop/mobile and real API.
  - Evidence: root reviewed/applied diff; 8 frontend boundary/state tests and web build pass. Edge verified combined filters, ordering, back navigation, keyboard eye, internal scrolling, desktop/390px mobile, real refresh success and isolated loading/error/retry/polling. Manual query/mutation race reproduced before correction and prevented after correction; independent reviewer confirms.
  - Blocker: none; next: final closure in T015.
- [x] T014 [P] Explain architecture and quotation lifecycle in TXT.
  - Status: done; agent: root; dependencies: T011; files: outputs/aloia-rfq-arquitetura.txt, relevant handoff sections.
  - Acceptance: FR-035 with all entities, keys/relations, event visibility, quote/ERP states and actual API-only quotation.
  - Verification: check against current entities/controllers/services and independent architecture review.
  - Evidence: coordinator inspected current entities/services/controllers/formula; independent reviewer checked all fields and lifecycle, and attempt-counter precision was corrected.
  - Blocker: none; next: include in final handoff.
- [x] T015 Integrate, validate, converge and leave complete review open without commits.
  - Status: done; agent: root + audit_rfq_architecture; dependencies: T012,T013,T014; files: integration review tree, spec/tasks/handoff/evidence.
  - Acceptance: FR-036; tests/builds/browser pass, all changes visible versus original, published branch intact, local review available.
  - Verification: full tests/builds, browser table/filters/order/refresh/keyboard, git HEAD/status/staged diff, VS Code SCM.
  - Evidence: root verified 322 tests/12 suites, 96.70% backend line coverage, both builds, live UI/API/database 200, desktop/mobile interactions and controlled refresh failures. VS Code Working Tree diff is open; review HEAD 2e810cf, staged empty, published root clean at efe2cd1.
  - Evidence: final convergence found zero gaps across 36 FR, 31 acceptance scenarios, 5 SC, original/refinement plan decisions and 5 constitution principles. No convergence tasks appended. TXT/handoff and three current screenshots delivered.
  - Blocker: none in this approved refinement; next: user review of uncommitted changes. Commit/push intentionally excluded by explicit request.

## Phase 8: Excalidraw architecture documentation
- [x] T016 Draw the implemented architecture as an editable Excalidraw board.
  - Status: done; agent: root; dependencies: T014; files: outputs/aloia-rfq-arquitetura.excalidraw, outputs/aloia-rfq-arquitetura-excalidraw.png, current handoff.
  - Acceptance: application components, all entities/keys/relationships and distinct event/quotation/ERP lifecycles match the approved TXT.
  - Verification: JSON schema/version and element-reference checks; 107 elements imported in Excalidraw; selected drawing exported by Excalidraw as PNG and visually reviewed.
  - Evidence: editable file and PNG saved; existing unrelated canvas content preserved; browser left open with the new drawing. No source-code changes or commits.
  - Blocker: none; next: user can edit the native file in Excalidraw.

## Phase 9: One quotation column
- [x] T017 Consolidate list quotation/delivery presentation in the Cotação column.
  - Status: done; agent: root; dependencies: T013; files: web/src/RfqList.tsx, RfqDetail.tsx, status-labels.ts, test/rfq-list-ui.test.ts, live spec/plan/handoff/architecture TXT.
  - Acceptance: no ERP column; sent displays “Cotação enviada ao ERP”; READY without a submission stays “Pronta para envio”; pending/error states never claim delivery; existing filters and scrolling remain usable.
  - Verification: focused status-label RED/GREEN tests, web build, real browser list/detail check and screenshot.
  - Evidence: 7 new label cases failed before the correction and passed afterward; 15 focused tests pass, web TypeScript/Vite build passes, diff check clean. Browser confirms 5 columns, sent label in list/detail with SO-1005, READY filter, and 390×844 layout with no page overflow.
  - Blocker: none; next: user review at port 5174; changes remain uncommitted.

## Phase 10: Reviewer demo startup
- [x] T018 Prepare reproducible reviewer scenarios on local startup and document validation.
  - Status: done; agent: root; dependencies: T017; files: src/rfq/rfq-demo.service.ts, rfq.module.ts, test/rfq-demo.test.ts, .env.example, README.md, spec/plan/tasks, handoff.
  - Acceptance: six approved RFQs, READY/MIXED manually submittable, repeat/concurrent startup preserves data, fresh rounds, no automatic ERP send, production guard.
  - Verification: RED/GREEN PostgreSQL tests, full suite, builds, live local API/UI.
  - Evidence: 13 initial tests failed on missing demos; 18 demo tests now pass. Full suite: 347 tests/13 suites; API and web builds pass. Live startup created six examples; browser verified READY enabled and PARTIAL disabled. No automatic ERP submission.
  - Blocker: none; next: manual reviewer test, changes uncommitted per review instruction.
