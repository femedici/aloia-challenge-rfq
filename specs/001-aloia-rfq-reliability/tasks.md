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

## Documentation revision — 2026-11-08
- [x] T011 Simplify `README.md` and add the supplied development steps and architecture to `docs/`.
  - Status: done; agent: root; dependencies: T009,T010; requirements: FR-027–028.
  - Files: `README.md`, `docs/passos_desafio.pdf`, `docs/arquitetura_aloia.png`, living spec, this tracker and `outputs/aloia-readme-handoff.md`.
  - Acceptance: concise Portuguese README follows the requested opening, links both unchanged attachments and retains the original challenge requirements, setup, decisions and issue recommendations.
  - Verification: compare attachment hashes, check local Markdown links, review against `SPEC.md`, execute documented tests/builds and check local API/UI.
  - Evidence: coordinator reviewed the diff against the original SPEC; both attachments match their source SHA-256; all local README links exist. 290 tests in 9 suites and both builds pass. Authenticated API, UI and Vite proxy return 200; PostgreSQL and ERP lookup are available. README and attachments published at `950d415955fac9ee5f8a4cb7b4474b0032a487c5`, verified against origin.
  - Blocker: none; next: none within this documentation revision. See `outputs/aloia-readme-handoff.md`.

## Dependencies and parallel execution
T002 (RFQ), T003 (ERP) and T005 (domain) use disjoint files and separate writer worktrees from
one common baseline. Root alone integrates each branch and updates status. T004/T006 converge
these components. UI waits for core verification; documentation and final publish follow validation.
