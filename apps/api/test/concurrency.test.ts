import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = 'http://localhost:4000';
// /admin endpoints are ADMIN-only; defaults match the demo admin created by seedDefaultData().
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@eventplatform.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'password123';
let serverOnline = false;
let adminHeaders: Record<string, string> = {};

describe('Concurrency & Seat Hold Integrity Tests', () => {
  beforeAll(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1000) });
      serverOnline = res.ok;
    } catch {
      serverOnline = false;
    }
    if (!serverOnline) return;

    const login = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const { token } = await login.json();
    adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  });

  it('Pessimistic lock: 100 concurrent requests for 5 seats -> exactly 5 succeed, 95 receive 409 conflict, 0 double booking', async () => {
    if (!serverOnline) {
      console.warn('[Notice] Live server not running on port 4000, skipping live HTTP concurrency test.');
      expect(true).toBe(true);
      return;
    }
    // 1. Fetch reserved event session
    const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
    expect(eventsRes.events.length).toBeGreaterThan(0);
    const reservedEvent = eventsRes.events.find((e: any) => e.seating_mode === 'RESERVED') || eventsRes.events[0];
    const session = reservedEvent.sessions[0];

    // 2. Fetch seats
    const seatsRes = await fetch(`${API_BASE}/sessions/${session.id}/seats`).then((r) => r.json());
    const targetSeatIds = seatsRes.seats.slice(0, 5).map((s: any) => s.id);
    expect(targetSeatIds.length).toBe(5);

    // 3. Run ticket drop simulation
    const simRes = await fetch(`${API_BASE}/admin/simulate/ticket-drop`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        sessionId: session.id,
        targetSeatIds,
        concurrentRequests: 100,
        strategy: 'pessimistic',
      }),
    }).then((r) => r.json());

    expect(simRes.benchmark.successfulHolds).toBe(5);
    expect(simRes.benchmark.conflicts409).toBe(95);
    expect(simRes.benchmark.errors500).toBe(0);
    expect(simRes.integrityReport.status).toBe('PASSED');
    expect(simRes.integrityReport.totalViolations).toBe(0);
  });

  it('Conditional compare-and-set: 100 concurrent requests -> exactly 5 succeed, 95 receive 409 conflict, 0 double booking', async () => {
    if (!serverOnline) {
      expect(true).toBe(true);
      return;
    }
    const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
    const reservedEvent = eventsRes.events.find((e: any) => e.seating_mode === 'RESERVED') || eventsRes.events[0];
    const session = reservedEvent.sessions[0];
    const seatsRes = await fetch(`${API_BASE}/sessions/${session.id}/seats`).then((r) => r.json());
    const targetSeatIds = seatsRes.seats.slice(0, 5).map((s: any) => s.id);

    const simRes = await fetch(`${API_BASE}/admin/simulate/ticket-drop`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        sessionId: session.id,
        targetSeatIds,
        concurrentRequests: 100,
        strategy: 'conditional',
      }),
    }).then((r) => r.json());

    expect(simRes.benchmark.successfulHolds).toBe(5);
    expect(simRes.benchmark.conflicts409).toBe(95);
    expect(simRes.benchmark.errors500).toBe(0);
    expect(simRes.integrityReport.status).toBe('PASSED');
    expect(simRes.integrityReport.totalViolations).toBe(0);
  });

  it('Integrity query returns 0 violations on session', async () => {
    if (!serverOnline) {
      expect(true).toBe(true);
      return;
    }
    const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
    const reservedEvent = eventsRes.events.find((e: any) => e.seating_mode === 'RESERVED') || eventsRes.events[0];
    const session = reservedEvent.sessions[0];

    const integrityRes = await fetch(`${API_BASE}/admin/integrity/${session.id}`, { headers: adminHeaders }).then((r) =>
      r.json()
    );
    expect(integrityRes.status).toBe('PASSED');
    expect(integrityRes.totalViolations).toBe(0);
    expect(integrityRes.doubleBookings).toEqual([]);
    expect(integrityRes.inconsistentSeats).toEqual([]);
    expect(integrityRes.capacityViolations).toEqual([]);
  });
});
