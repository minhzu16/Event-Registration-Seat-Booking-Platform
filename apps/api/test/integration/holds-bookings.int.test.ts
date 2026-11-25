import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';

interface SeatItem { id: string; status: string; }
interface SeatsBody { seats: SeatItem[]; }
interface HoldBody { holdId: string; expiresAt: string; error?: string; }
interface BookingItem { id: string; status: string; reference: string; }
interface TicketItem { id: string; code: string; }
interface ConfirmBody { booking: BookingItem; tickets: TicketItem[]; error?: string; }
interface MyBookingsBody { bookings: Array<BookingItem & { tickets: TicketItem[] }>; }
interface SimpleBody { message?: string; error?: string; }

function auth(token: string, extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra };
}

async function post<T>(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body: data };
}

async function get<T>(url: string, headers: Record<string, string>): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { headers });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body: data };
}

async function del<T>(url: string, headers: Record<string, string>): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { method: 'DELETE', headers });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body: data };
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('holds + bookings on real PostgreSQL', () => {
  const JWT_SECRET = 'a'.repeat(32);
  const QR_HMAC_SECRET = 'b'.repeat(32);
  let pool: Pool;
  let server: Server;
  let base: string;
  let tokenA: string, tokenB: string;
  let userA: { id: string; email: string; fullName: string };
  let userB: { id: string; email: string; fullName: string };
  let orgId: string, eventId: string, sessionId: string, ticketTypeId: string;
  let seatIds: string[], holdAId: string, bookingAId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.QR_HMAC_SECRET = QR_HMAC_SECRET;
    process.env.NODE_ENV = 'test';
    process.env.DEMO_MODE = 'false';

    const db = await import('../../src/database.js');
    pool = db.pool;
    const { default: holdsRoutes } = await import('../../src/routes/holds.routes.js');
    const { default: bookingsRoutes } = await import('../../src/routes/bookings.routes.js');

    const schemaSql = fs.readFileSync(new URL('../../../../scripts/schema.sql', import.meta.url), 'utf-8');
    await pool.query(schemaSql);
    await pool.query(
      'TRUNCATE TABLE users, organisers, events, sessions, ticket_types, event_seats, holds, bookings, tickets, idempotency_records RESTART IDENTITY CASCADE;'
    );

    userA = { id: randomUUID(), email: 'a@test.local', fullName: 'Attendee A' };
    userB = { id: randomUUID(), email: 'b@test.local', fullName: 'Attendee B' };
    await pool.query(
      `INSERT INTO users (id, email, password_hash, full_name, role) VALUES ($1, $2, 'hash', $3, 'ATTENDEE'), ($4, $5, 'hash', $6, 'ATTENDEE');`,
      [userA.id, userA.email, userA.fullName, userB.id, userB.email, userB.fullName]
    );

    orgId = randomUUID();
    await pool.query(`INSERT INTO organisers (id, name, description, contact_email, owner_id) VALUES ($1, 'Org 1', 'Test', 'org@test.local', $2);`, [orgId, userA.id]);

    eventId = randomUUID();
    await pool.query(`INSERT INTO events (id, organiser_id, title, seating_mode, status, max_tickets_per_user) VALUES ($1, $2, 'Test Concert', 'RESERVED', 'PUBLISHED', 10);`, [eventId, orgId]);

    sessionId = randomUUID();
    await pool.query(`INSERT INTO sessions (id, event_id, starts_at, ends_at, sales_open_at) VALUES ($1, $2, now() + interval '7 days', now() + interval '7 days 2 hours', now() - interval '1 hour');`, [sessionId, eventId]);

    ticketTypeId = randomUUID();
    await pool.query(`INSERT INTO ticket_types (id, session_id, name, price, capacity, reserved) VALUES ($1, $2, 'Standard', 50, 10, 0);`, [ticketTypeId, sessionId]);

    seatIds = Array.from({ length: 6 }, () => randomUUID());
    for (let i = 0; i < 6; i++) {
      await pool.query(
        `INSERT INTO event_seats (id, session_id, ticket_type_id, section, row_label, seat_number, status) VALUES ($1, $2, $3, 'A', '1', $4, 'AVAILABLE');`,
        [seatIds[i], sessionId, ticketTypeId, i + 1]
      );
    }

    const app = express();
    app.use(express.json());
    app.use('/', holdsRoutes);
    app.use('/', bookingsRoutes);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    tokenA = jwt.sign({ id: userA.id, email: userA.email, role: 'ATTENDEE', fullName: userA.fullName }, JWT_SECRET);
    tokenB = jwt.sign({ id: userB.id, email: userB.email, role: 'ATTENDEE', fullName: userB.fullName }, JWT_SECRET);
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) await pool.end();
  });

  it('1. GET session seats returns 6 seats, all available', async () => {
    const { status, body } = await get<SeatsBody>(`${base}/sessions/${sessionId}/seats`, auth(tokenA));
    expect(status).toBe(200);
    expect(body.seats).toHaveLength(6);
    expect(body.seats.every((s) => s.status === 'AVAILABLE')).toBe(true);
  });

  it('2. A holds 2 seats -> success with hold id and expiry; DB holds has 1 row', async () => {
    const { status, body } = await post<HoldBody>(`${base}/sessions/${sessionId}/holds`, { seatIds: [seatIds[0], seatIds[1]] }, auth(tokenA));
    expect(status).toBe(201);
    expect(body.holdId).toBeDefined();
    expect(body.expiresAt).toBeDefined();
    holdAId = body.holdId;

    const { rows } = await pool.query('SELECT * FROM holds WHERE id = $1', [holdAId]);
    expect(rows).toHaveLength(1);
  });

  it("3. B tries to hold one of A's seats -> rejected; A's hold unchanged", async () => {
    const { status } = await post<HoldBody>(`${base}/sessions/${sessionId}/holds`, { seatIds: [seatIds[0]] }, auth(tokenB));
    expect(status).toBe(409);

    const { rows } = await pool.query('SELECT user_id FROM holds WHERE id = $1', [holdAId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(userA.id);
  });

  it('4. Race: 20 parallel hold requests for SAME free seat -> 1 success, 19 rejections', async () => {
    const seatId = seatIds[2];
    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM event_seats WHERE id = $1 FOR UPDATE', [seatId]);

    // fire all 20 requests WITHOUT awaiting them yet
    const inFlight = Array.from({ length: 20 }, (_, i) =>
      post<HoldBody>(`${base}/sessions/${sessionId}/holds`, { seatIds: [seatId] }, auth(i % 2 === 0 ? tokenA : tokenB))
    );

    // give every request time to reach the database and block (or, without the app's lock, read the row)
    await new Promise((r) => setTimeout(r, 500));
    await blocker.query('COMMIT');
    blocker.release();
    const results = await Promise.all(inFlight);

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);

    const { rows: countRows } = await pool.query(
      "SELECT count(*) FROM event_seats WHERE id = $1 AND status = 'HELD'",
      [seatId]
    );
    expect(Number(countRows[0].count)).toBe(1);

    const successfulHoldId = results.find((r) => r.status === 201)!.body.holdId;
    const { rows: seatRows } = await pool.query('SELECT status, hold_id FROM event_seats WHERE id = $1', [seatId]);
    expect(seatRows[0].status).toBe('HELD');
    expect(seatRows[0].hold_id).toBe(successfulHoldId);

    const { rows: holdRows } = await pool.query('SELECT id FROM holds WHERE id = $1', [seatRows[0].hold_id]);
    expect(holdRows).toHaveLength(1);
  });

  it('5. Hold expiry: setting expires_at in past makes seat available again', async () => {
    await pool.query("UPDATE holds SET expires_at = now() - interval '1 minute' WHERE id = $1", [holdAId]);
    await pool.query("UPDATE event_seats SET hold_expires_at = now() - interval '1 minute' WHERE hold_id = $1", [holdAId]);

    const { status, body } = await get<SeatsBody>(`${base}/sessions/${sessionId}/seats`, auth(tokenA));
    expect(status).toBe(200);
    const seat0 = body.seats.find((s) => s.id === seatIds[0]);
    expect(seat0?.status).toBe('AVAILABLE');

    const newHold = await post<HoldBody>(`${base}/sessions/${sessionId}/holds`, { seatIds: [seatIds[0]] }, auth(tokenB));
    expect(newHold.status).toBe(201);
  });

  it('6. A confirms hold -> booking created, tickets created, seats booked', async () => {
    const holdRes = await post<HoldBody>(`${base}/sessions/${sessionId}/holds`, { seatIds: [seatIds[3], seatIds[4]] }, auth(tokenA));
    expect(holdRes.status).toBe(201);

    const { status, body } = await post<ConfirmBody>(`${base}/holds/${holdRes.body.holdId}/confirm`, { paymentMethod: 'mock_card' }, auth(tokenA));
    expect(status).toBe(201);
    expect(body.booking.status).toBe('CONFIRMED');
    expect(body.tickets).toHaveLength(2);
    bookingAId = body.booking.id;

    const { rows: bRows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingAId]);
    expect(bRows).toHaveLength(1);
    const { rows: tRows } = await pool.query('SELECT * FROM tickets WHERE booking_id = $1', [bookingAId]);
    expect(tRows).toHaveLength(2);
    const { rows: sRows } = await pool.query('SELECT status FROM event_seats WHERE id = ANY($1::uuid[])', [[seatIds[3], seatIds[4]]]);
    expect(sRows.every((s: { status: string }) => s.status === 'BOOKED')).toBe(true);
  });

  it('7. Idempotency: confirming twice with same Idempotency-Key returns same response', async () => {
    const hRes = await post<HoldBody>(`${base}/sessions/${sessionId}/holds`, { seatIds: [seatIds[5]] }, auth(tokenA));
    expect(hRes.status).toBe(201);
    const holdId = hRes.body.holdId;
    const key = randomUUID();

    const res1 = await post<ConfirmBody>(`${base}/holds/${holdId}/confirm`, { paymentMethod: 'mock_card' }, auth(tokenA, { 'Idempotency-Key': key }));
    expect(res1.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));

    const res2 = await post<ConfirmBody>(`${base}/holds/${holdId}/confirm`, { paymentMethod: 'mock_card' }, auth(tokenA, { 'Idempotency-Key': key }));
    expect(res2.status).toBe(201);
    expect(res2.body.booking.id).toBe(res1.body.booking.id);
    expect(res2.body.booking.reference).toBe(res1.body.booking.reference);

    const { rows } = await pool.query('SELECT count(*) as count FROM bookings WHERE hold_id = $1', [holdId]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it("8. B cannot confirm or cancel A's hold/booking -> 403 or 404", async () => {
    const confirmRes = await post<SimpleBody>(`${base}/holds/${holdAId}/confirm`, {}, auth(tokenB));
    expect([403, 404]).toContain(confirmRes.status);

    const cancelRes = await post<SimpleBody>(`${base}/bookings/${bookingAId}/cancel`, {}, auth(tokenB));
    expect([403, 404]).toContain(cancelRes.status);
  });

  it('9. DELETE /holds/:id by owner releases seats', async () => {
    const holdRes = await post<HoldBody>(`${base}/sessions/${sessionId}/holds`, { seatIds: [seatIds[1]] }, auth(tokenA));
    expect(holdRes.status).toBe(201);
    const holdId = holdRes.body.holdId;

    const { status } = await del<SimpleBody>(`${base}/holds/${holdId}`, auth(tokenA));
    expect(status).toBe(200);

    const { rows: sRows } = await pool.query('SELECT status, hold_id FROM event_seats WHERE id = $1', [seatIds[1]]);
    expect(sRows[0].status).toBe('AVAILABLE');
    expect(sRows[0].hold_id).toBeNull();

    const { rows: hRows } = await pool.query('SELECT * FROM holds WHERE id = $1', [holdId]);
    expect(hRows).toHaveLength(0);
  });

  it('10. GET /me/bookings lists booking for A but not for B', async () => {
    const resA = await get<MyBookingsBody>(`${base}/me/bookings`, auth(tokenA));
    expect(resA.status).toBe(200);
    expect(resA.body.bookings.some((b) => b.id === bookingAId)).toBe(true);

    const resB = await get<MyBookingsBody>(`${base}/me/bookings`, auth(tokenB));
    expect(resB.status).toBe(200);
    expect(resB.body.bookings.some((b) => b.id === bookingAId)).toBe(false);
  });
});
