# ADR 001: Seat Hold Concurrency with `SELECT ... FOR UPDATE`

- **Status**: Accepted
- **Context**: During high-concurrency ticket drops, hundreds of clients attempt to hold the same contested seats simultaneously. Uncoordinated read-then-write updates cause double bookings, while locking rows in arbitrary order causes PostgreSQL deadlocks.
- **Decision**: Default `BOOKING_STRATEGY` to `pessimistic` in `apps/api/src/config.ts`, implemented in `holdSeatsPessimistic` (`apps/api/src/services/hold-strategies.service.ts`). Inside `withTransaction`, the query locks target rows in deterministic order:
  `SELECT id, status, hold_id, hold_expires_at FROM event_seats WHERE session_id = $1 AND id = ANY($2::uuid[]) ORDER BY id ASC FOR UPDATE`.
  Expired holds (`status = 'HELD' AND hold_expires_at < now()`) are reclaimed inline; otherwise conflicts return HTTP `409 SEAT_UNAVAILABLE`. Conditional CAS (`holdSeatsConditional`) and `naive` strategies remain available for benchmarking in `/admin/simulate/ticket-drop` (`apps/web/src/app/simulate/page.tsx`).
- **Consequences**: Zero double bookings and zero deadlocks under concurrent load, at the cost of row-lock serialization on the exact contested seat IDs.
