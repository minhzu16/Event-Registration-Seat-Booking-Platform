# PJ1 — SeatLock (Event Registration & Seat Booking Platform)

Monorepo (`pnpm` workspaces) with Express/TypeScript API (`apps/api`) and Next.js 16 frontend (`apps/web`).

## Common Commands
- Install: `pnpm install --frozen-lockfile`
- Build all: `pnpm --recursive run build`
- API typecheck: `pnpm --filter event-platform-api build`
- API unit + coverage tests: `pnpm --filter event-platform-api test:coverage`
- API PostgreSQL integration tests (requires DB): `pnpm --filter event-platform-api test`
- Web lint: `pnpm --filter web lint`
- Web build: `pnpm --filter web build`
- Web E2E (Playwright): `pnpm --filter web test:e2e`
