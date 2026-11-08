# Implementation Plan: Aloia RFQ reliability

## Latest presentation adjustment — 2026-11-07
T017 replaces the separate ERP list column with delivery-aware Cotação labels. Reuse existing submissionStatus and styles: sent is confirmed delivery, not_sent uses the quotation label, other delivery states retain explicit progress/failure wording. Apply the same display label to the detail heading, while keeping its delivery panel and submit guards. Underlying domain statuses/API remain unchanged; filters/order continue to use quotation state, with READY filter wording covering ready or sent quotes. Verify labels with small tests, build and browser; keep review uncommitted.


## Approved refinement execution — 2026-11-07

Goal: improve the RFQ list and status clarity, explain actual architecture, and expose the complete
original-to-current change set uncommitted in VS Code. Stack and persistence model stay unchanged.
User approved the design; no commit/push in this refinement, including isolated writer branches.

1. T011 root prepares review worktree at 2e810cf, applies the previously published tree as working
   changes, updates this spec/plan/tasks, and opens VS Code. Intent-to-add permits viewing new-file diffs
   without staging their content. Original published branch efe2cd1 is preserved.
2. T012 backend writer owns rfq list/controller, list query validation and targeted PostgreSQL HTTP tests.
   RED tests for global filtering/order/status parity; GREEN parameterized query before pagination,
   whitelisted sort keys and additive submissionStatus in existing summary array. No new endpoint/table.
   Query filtering/ordering needs a SQL projection of quotation state. Returned list/detail/submit
   retain the authoritative deriveStatus helper; exhaustive real-database parity tests protect this
   query projection. Page selection and hydration share a read snapshot to avoid status races.
3. T013 frontend writer independently owns web/src, supplied logo asset and frontend behavior tests.
   Use filters rfq/customer/status; sortBy rfqId/customerName/itemCount/status/submissionStatus and
   sortDirection asc/desc. Maintain current listRfqs(page,pageSize,options?) API compatibility.
   Use fixed viewport list shell, scrolling table/sticky headers, accessible sort/eye controls and
   delivery-aware Cotação labels. Explicit refresh feedback follows actual refetch result, not polling.
4. T014 root documents the factual architecture in outputs/aloia-rfq-arquitetura.txt, including the
   event's atomic visibility and rfq_item UUID FK versus business rfqId links in event/submission.
5. T015 root applies each isolated writer diff to the review tree, reads it, runs focused then full
   tests and API/web builds, checks browser desktop/mobile/filter/order/refresh behavior and VS Code.
   Update handoff and sole tracker from evidence; leave all refinement changes uncommitted.

Commands: npm test -- --runInBand; npm run build; npm --prefix web run build.
Review API uses 3001 and UI 5174 with existing local database/ERP preserved; no reset or deploy.
Only root integrates and updates tasks. Writers return changed files, RED/GREEN evidence and risks.

**Branch**: `agent/aloia-rfq-reliability` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)
**Goal**: Complete all attached RFQ requirements without changing the existing architecture.
**Architecture**: PostgreSQL arbitrates event/RFQ/submission uniqueness. Existing Nest services
perform transactional event changes and a durable ERP delivery loop. React Query polls delivery state.
**Tech Stack**: TypeScript/Node 22, NestJS 11, TypeORM 0.3, PostgreSQL 17, React 19, Vite 7, Jest 30.

## Summary
Keep controllers thin, preserve original/normalized fields and every RFQ item. Add only an event
ledger and submission table. Fix normalization, dates, exact decimal prices and input validation.
The visual update follows passing core behavior checks. No new runtime dependency is planned.

## Technical Context
- Storage: existing PostgreSQL; unique constraints and transaction advisory locks.
- Tests: Jest, Supertest, real PostgreSQL in isolated task-created schemas, controlled HTTP ERP.
- Target: local Node API and Vite UI; existing compose database/ERP reused without reset.
- Performance: no new throughput SLA; validate ten concurrent duplicate deliveries and submissions.
- Constraints: no duplicate ERP side effects, secret-free logs/browser bundle, current file patterns.
- Scope: 28 functional requirements, two domain tables plus TypeORM migration metadata,
  existing API plus one submit endpoint.

## Constitution Check
Before and after design: PASS. Scope and existing stack preserved; all requested improvements
mapped; TDD and real persistence tests required; visual work follows logic; no unsupported
exactly-once claim for unresolved external outcomes. Original raw data remains available.

## Project Structure
- `src/common/`: normalization, exact price calculation, payload validation, config and API-key guard.
- `src/rfq/`: existing controllers/service/entities plus event ledger and request types.
- `src/erp/`: existing client/module plus durable submission entity/service.
- `test/`: domain, HTTP, real PostgreSQL and ERP failure/concurrency tests.
- `web/src/`: current list/detail/API/styles updated in place.
- `specs/001-aloia-rfq-reliability/`: sole live spec, plan, contracts, decisions, tasks and evidence.
- `outputs/`: final handoff and requirement-to-code/inventory evidence.

## Execution and validation
1. Domain worktree: write regressions first, observe date/blacklist/price failures, implement
   small exact-decimal and validation helpers; run targeted Jest suite and build.
2. ERP worktree independently: real HTTP tests for 201/422/429/503, response loss and reconciliation;
   persist attempts before POST, serialize workers with PostgreSQL locks, validate restart/concurrency.
3. Coordinator RFQ work: real database HTTP tests fail on cancellation/concurrent create; add atomic
   event claim and per-RFQ lock, preserve early cancellation, apply uniqueness and shared statuses.
4. Integrate each validated branch separately, then wire quote validation/calculation, configuration,
   API authentication, submit snapshot and detail delivery output. Run HTTP and full integration tests.
5. After core green, update React views and Aloia styling; verify keyboard behavior, narrow/wide screens,
   loading/errors, pagination and polling against the local API.
6. Run coverage, API/web builds, deterministic ERP chaos cases and live smoke; converge against every FR.
7. Update README, AGENT.md, spec, tracker and handoff with actual evidence; commit/push feature branch.

Every nontrivial change follows failing-test -> minimal implementation -> passing-test -> review.
Commands: `npm test -- --runInBand`, `npm run build`, `npm --prefix web run build`.
Tests must load local configuration without printing credentials and only remove schemas they created.

## Complexity Tracking
No constitution violations. Two small persistence entities are necessary for durable idempotency.
A queue broker, new framework, and generalized workflow engine are unnecessary.

## Verified upgrade adjustment
Independent review demonstrated that TypeORM synchronization drops/recreates a column when changing
integer to double precision. A native migration now runs first and uses PostgreSQL ALTER COLUMN TYPE,
preserving existing IDs, quantities and quotations. TypeORM adds its `migrations` metadata table.
The existing synchronization configuration remains; a full production migration rollout is documented
as follow-up rather than expanding this feature. Downgrading fractional original quantities is refused.

## Reviewer demo execution — 2026-11-08
Approved six scenarios; one sequential task because startup, fixtures and assertions share the same contract. Add RfqDemoService to existing RfqModule using OnApplicationBootstrap, DEMO_MODE=true and optional validated DEMO_ROUND. For each RFQ, outer transaction plus existing per-RFQ advisory lock; skip existing RFQ; use transaction-bound RfqService repositories to reuse processEvent/quoteItem/noQuote. Nested transactions keep creation, cancellation and pricing atomic. No new table, endpoint or dependency. Test real isolated PostgreSQL startup, states, submit guards/payload, repeated and concurrent initialization, rollback and fresh rounds; run full suite/builds and local startup. README and .env.example explain reviewer path. Preserve review worktree and no-commit instruction.
