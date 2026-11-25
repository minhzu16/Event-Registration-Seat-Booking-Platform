# ADR 003: Testing & CI Verification Strategy

- **Status**: Accepted
- **Context**: Seat-locking correctness, cryptographic QR passes, and UI flows span both Node/PostgreSQL backend logic and Next.js client interactions.
- **Decision**: Use a layered verification pyramid:
  1. **Unit & Contract Tests (`vitest`)**: `apps/api/vitest.config.ts` provides isolated test-only `JWT_SECRET`/`QR_HMAC_SECRET` env vars so tests in `apps/api/test/*.test.ts` (errors, validation, SafeTix QR, CORS, Prometheus `/metrics`) run without external services.
  2. **Integration & Concurrency Benchmarks**: `apps/api/test/integration/holds-bookings.int.test.ts` and `scripts/concurrency-benchmark.ts` exercise real PostgreSQL transactions.
  3. **Frontend Lint, Build & Playwright E2E**: `apps/web` runs `eslint`, `next build`, and `playwright test` (`apps/web/playwright.config.ts`) against the running stack.
- **Consequences**: Fast feedback in CI on every commit without requiring a live database for unit suites, while preserving full transactional and browser verification.
