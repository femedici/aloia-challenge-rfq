# Implementation Plan: Aloia RFQ reliability

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
- Scope: 28 functional requirements, two new tables, existing API plus one submit endpoint.

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
