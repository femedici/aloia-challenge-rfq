# Validation quickstart

Use Node 22 and Docker. Preserve existing .env and data; follow final README for a fresh setup.
Run `npm test -- --runInBand`, `npm run build`, `npm --prefix web run build`.
Run domain regressions, then PostgreSQL-backed webhook/ERP tests using isolated created schemas.
Verify duplicate, parallel, reordered, resend and invalid-signature webhook scenarios.
Verify ERP 422 permanent failure, 429 Retry-After, 503 retry, delayed post-write response,
concurrent submit and restart/ambiguous outcome reconciliation with at most one order.
Start API and Vite locally, inspect READY-only submission, progress polling, error messages,
pagination, keyboard focus and narrow/wide layouts. Final handoff records URLs and actual results.
