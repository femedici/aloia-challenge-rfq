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
- [ ] T002 [P] [US1] Implement transactional webhook ledger, uniqueness and cancellation ordering in `src/rfq/` (excluding rfq.types.ts) with `test/rfq-events.test.ts` and `test/database.ts`.
  - Status: in_progress; agent: root; dependencies: T001; requirements: FR-001–004, FR-012, FR-015, FR-023.
  - Acceptance: concurrent/repeated event returns 2xx once, first creation wins, reordered cancellation persists, shared status agrees, no terminal item revival.
  - Verification: `npm test -- --runInBand test/rfq-events.test.ts`; real PostgreSQL concurrency and rollback tests.
  - Blocker: none; next: write failing database tests before implementation.

## Phase 3: User story 2 — ERP delivery
- [ ] T003 [P] [US2] Build durable delivery and ERP error/reconciliation handling in `src/erp/**` and `test/erp*.test.ts`.
  - Status: in_progress; agent: erp_delivery; dependencies: T001; requirements: FR-007–009, FR-012, FR-023.
  - Acceptance: durable state, serialized workers, 422 permanent, 429/503 safe retry, uncertain outcome reconciliation, restart and duplicate protection.
  - Verification: targeted ERP Jest suites with real PostgreSQL and local HTTP servers; `npm run build`.
  - Blocker: none; next: isolated worktree and RED tests; interface contract in contracts/api.md.
- [ ] T004 [US2] Integrate submit snapshot and detail delivery state in `src/rfq/rfq.service.ts`, `rfq.controller.ts`, `rfq.module.ts` and `test/rfq-submit.test.ts`.
  - Status: pending; agent: root; dependencies: T002,T003,T005; requirements: FR-005–008, FR-012.
  - Acceptance: READY-only first submit, one immutable quoted-only payload, repeated submit returns existing state, all detail items retained.
  - Verification: concurrent HTTP submits, non-READY 409, late cancellation, atomic snapshot/quote races.
  - Blocker: predecessors; next: integrate reviewed writer commits one at a time.

## Phase 4: User story 3 — domain correctness and security
- [ ] T005 [P] [US3] Fix normalization/dates/pricing and validate payloads in `src/common/normalize.ts`, `price.ts`, `validation.ts`, `src/rfq/rfq.types.ts`, `test/domain.test.ts`, `test/normalize.test.ts`.
  - Status: in_progress; agent: domain_rules; dependencies: T001; requirements: FR-016–020, FR-025.
  - Acceptance: original data preserved, exact half-up example and ties, real dates independent of timezone, normalized blacklist, clear runtime validation.
  - Verification: domain/normalization Jest tests for valid/invalid inputs and monetary boundaries; build.
  - Blocker: none; next: isolated worktree, RED regressions then minimal helpers per contracts/api.md.
- [ ] T006 [US3] Integrate API-wide authentication, validated startup, payload helpers and pagination in `src/common/api-key.guard.ts`, `config.ts`, `src/main.ts`, `src/app.module.ts`, RFQ controllers/service, `scripts/send-webhooks.mjs`, `test/security.test.ts`.
  - Status: pending; agent: root; dependencies: T002,T005; requirements: FR-013, FR-019–020, FR-024–025.
  - Acceptance: missing/wrong key fails every route, HMAC remains required, malformed payload 400, missing config fails before listen.
  - Verification: HTTP security matrix, startup tests, domain/HTTP integration and builds.
  - Blocker: predecessors; next: wire helpers after reviewed integration.

## Phase 5: User story 4 — interface after core validation
- [ ] T007 [US4] Implement submission controls, polling, pagination, accessible feedback and Aloia styling in `web/src/`.
  - Status: pending; agent: root; dependencies: T004,T006; requirements: FR-010–011, FR-021–022, FR-026.
  - Acceptance: all delivery states visible, READY-only action, loading/errors, no key in bundle, usable keyboard/narrow/wide layouts.
  - Verification: web build and real local browser workflow, page 2 navigation, polling and failure feedback.
  - Blocker: core must pass; next: inspect Aloia reference after core validation.

## Phase 6: Convergence, evidence and delivery
- [ ] T008 Run comprehensive validation/convergence and close verified gaps in `test/`, feature artifacts and affected source.
  - Status: pending; agent: root + independent reviewer; dependencies: T004,T006,T007; requirements: FR-001–026, SC-001–004.
  - Acceptance: every rule has positive/negative evidence, real concurrent/chaos tests pass, measured coverage reported, browser verified.
  - Verification: full Jest with coverage, API/web builds, live smoke, independent diff review, speckit-converge.
  - Blocker: implementation; next: review after core integration.
- [ ] T009 Write final `README.md`, corrected `AGENT.md` and `outputs/aloia-rfq-handoff.md`, including every requirement/code line and additions inventory.
  - Status: pending; agent: root; dependencies: T008; requirements: FR-014, FR-027–028, SC-001.
  - Acceptance: reproducible instructions, actual decisions/AI use, remaining issues/impact/recommendation, new files/entities/tables/endpoints and risks.
  - Verification: reread requirements against final diff, check cited file lines and commands.
  - Blocker: final evidence pending; next: draft from actual implementation.
- [ ] T010 Commit and push complete verified feature branch and leave local API/UI available for testing.
  - Status: pending; agent: root; dependencies: T009; requirements: SC-005.
  - Acceptance: clean in-scope commits, remote HEAD matches, local URLs verified, no merge/deploy/worktree cleanup.
  - Verification: git status/log/ls-remote and fresh local readiness/browser checks.
  - Blocker: delivery; next: final verification and push.

## Dependencies and parallel execution
T002 (RFQ), T003 (ERP) and T005 (domain) use disjoint files and separate writer worktrees from
one common baseline. Root alone integrates each branch and updates status. T004/T006 converge
these components. UI waits for core verification; documentation and final publish follow validation.
