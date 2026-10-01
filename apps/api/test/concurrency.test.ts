import { describe, it, expect } from 'vitest';

const API_BASE = 'http://localhost:4000';

describe('Concurrency & Seat Hold Integrity Tests', () => {
  it('Pessimistic lock: 100 concurrent requests for 5 seats -> exactly 5 succeed, 95 receive 409 conflict, 0 double booking', async () => {
    // 1. Fetch first event session
    const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
    expect(eventsRes.events.length).toBeGreaterThan(0);
    const session = eventsRes.events[0].sessions[0];

    // 2. Fetch seats
    const seatsRes = await fetch(`${API_BASE}/sessions/${session.id}/seats`).then((r) => r.json());
    const targetSeatIds = seatsRes.seats.slice(0, 5).map((s: any) => s.id);
    expect(targetSeatIds.length).toBe(5);

    // 3. Run ticket drop simulation
    const simRes = await fetch(`${API_BASE}/admin/simulate/ticket-drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
    const session = eventsRes.events[0].sessions[0];
    const seatsRes = await fetch(`${API_BASE}/sessions/${session.id}/seats`).then((r) => r.json());
    const targetSeatIds = seatsRes.seats.slice(0, 5).map((s: any) => s.id);

    const simRes = await fetch(`${API_BASE}/admin/simulate/ticket-drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
    const session = eventsRes.events[0].sessions[0];

    const integrityRes = await fetch(`${API_BASE}/admin/integrity/${session.id}`).then((r) => r.json());
    expect(integrityRes.status).toBe('PASSED');
    expect(integrityRes.totalViolations).toBe(0);
    expect(integrityRes.doubleBookings).toEqual([]);
    expect(integrityRes.inconsistentSeats).toEqual([]);
    expect(integrityRes.capacityViolations).toEqual([]);
  });
});
