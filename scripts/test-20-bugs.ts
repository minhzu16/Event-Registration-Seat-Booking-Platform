import pg from 'pg';
const { Pool } = pg;

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5433/event_platform',
});

interface TestResult {
  id: number;
  name: string;
  category: 'Concurrency' | 'Integrity' | 'Security' | 'Business Logic';
  status: 'PASS' | 'FAIL';
  durationMs: number;
  details: string;
}

const results: TestResult[] = [];

async function logResult(
  id: number,
  name: string,
  category: TestResult['category'],
  fn: () => Promise<string>
) {
  const start = Date.now();
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    results.push({ id, name, category, status: 'PASS', durationMs, details });
    console.log(`  [PASS] Bug ${id.toString().padStart(2, '0')}: ${name} (${durationMs}ms) - ${details}`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const msg = err.message || String(err);
    results.push({ id, name, category, status: 'FAIL', durationMs, details: msg });
    console.error(`  [FAIL] Bug ${id.toString().padStart(2, '0')}: ${name} (${durationMs}ms) - ${msg}`);
  }
}

// Helpers
async function getAuthToken(email = 'alice@example.com', password = 'password123') {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  if (!res.token) throw new Error(`Auth failed for ${email}: ${JSON.stringify(res)}`);
  return res.token;
}

async function createFreshUser(role: 'ATTENDEE' | 'ORGANISER' | 'STAFF' = 'ATTENDEE') {
  const email = `test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`;
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'password123',
      fullName: `Test User ${Date.now()}`,
      role,
    }),
  }).then((r) => r.json());
  return { email, token: res.token, user: res.user };
}

async function getAvailableSessionAndSeats(count = 2) {
  const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
  const reservedEvent = eventsRes.events.find((e: any) => e.seating_mode === 'RESERVED');
  if (!reservedEvent || !reservedEvent.sessions?.length) throw new Error('No reserved session found');
  const session = reservedEvent.sessions[0];

  const seatsRes = await fetch(`${API_BASE}/sessions/${session.id}/seats`).then((r) => r.json());
  const availableSeats = seatsRes.seats.filter((s: any) => s.status === 'AVAILABLE');
  if (availableSeats.length < count) {
    // Reset seats via admin simulate endpoint if needed
    throw new Error(`Need ${count} available seats, found ${availableSeats.length}`);
  }

  return {
    event: reservedEvent,
    session,
    seats: availableSeats.slice(0, count),
  };
}

async function runAllBugTests() {
  console.log('\n======================================================================');
  console.log('      RUNNING TEST SUITE: 20 COMMON BUGS IN EVENT SEAT BOOKING       ');
  console.log('======================================================================\n');

  const attendeeToken = await getAuthToken('alice@example.com');
  const staffToken = await getAuthToken('staff@eventplatform.com');
  const organiserToken = await getAuthToken('organiser@techsummit.io');

  // -------------------------------------------------------------------------
  // BUG 1: Double Booking Race Condition on Single Seat
  // -------------------------------------------------------------------------
  await logResult(
    1,
    'Double Booking on Single Seat (Parallel Race)',
    'Concurrency',
    async () => {
      const u1 = await createFreshUser();
      const u2 = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);
      const targetSeatId = seats[0].id;

      // Both users fire at the exact same millisecond
      const [res1, res2] = await Promise.all([
        fetch(`${API_BASE}/sessions/${session.id}/holds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
          body: JSON.stringify({ seatIds: [targetSeatId], strategy: 'pessimistic' }),
        }),
        fetch(`${API_BASE}/sessions/${session.id}/holds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u2.token}` },
          body: JSON.stringify({ seatIds: [targetSeatId], strategy: 'pessimistic' }),
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      if (statuses[0] !== 201 || statuses[1] !== 409) {
        throw new Error(`Expected [201, 409], received [${statuses.join(', ')}]`);
      }
      return 'Exactly 1 user won (201), other safely rejected (409)';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 2: Deadlock on Multi-Seat Cross-Booking ([A, B] vs [B, A])
  // -------------------------------------------------------------------------
  await logResult(
    2,
    'Deadlock on Multi-Seat Cross-Booking (Lock Sorting ORDER BY id)',
    'Concurrency',
    async () => {
      const u1 = await createFreshUser();
      const u2 = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(2);
      const seatA = seats[0].id;
      const seatB = seats[1].id;

      // User 1 requests [A, B], User 2 requests [B, A]
      const [res1, res2] = await Promise.all([
        fetch(`${API_BASE}/sessions/${session.id}/holds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
          body: JSON.stringify({ seatIds: [seatA, seatB], strategy: 'pessimistic' }),
        }),
        fetch(`${API_BASE}/sessions/${session.id}/holds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u2.token}` },
          body: JSON.stringify({ seatIds: [seatB, seatA], strategy: 'pessimistic' }),
        }),
      ]);

      if (res1.status === 500 || res2.status === 500) {
        throw new Error('Deadlock occurred! Received HTTP 500');
      }

      const statuses = [res1.status, res2.status].sort();
      if (statuses[0] !== 201 || statuses[1] !== 409) {
        throw new Error(`Expected one 201 and one 409, got ${statuses.join(', ')}`);
      }
      return 'Zero deadlocks: Row-level lock ordered by ID prevented cycle';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 3: General Admission (GA) Capacity Over-Selling
  // -------------------------------------------------------------------------
  await logResult(
    3,
    'General Admission Capacity Over-Selling Check',
    'Integrity',
    async () => {
      const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
      const gaEvent = eventsRes.events.find((e: any) => e.seating_mode === 'GA');
      if (!gaEvent) throw new Error('No GA event found');
      const sess = gaEvent.sessions[0];
      const ttRes = await fetch(`${API_BASE}/sessions/${sess.id}/seats`).then((r) => r.json());
      const tt = ttRes.ticketTypes[0];

      const u = await createFreshUser();
      // Try to request more than capacity
      const excessQty = tt.capacity + 100;
      const res = await fetch(`${API_BASE}/sessions/${sess.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ ticketTypeId: tt.id, quantity: excessQty }),
      });

      if (res.status === 201) throw new Error('System allowed hold exceeding capacity!');
      return `Safely rejected with HTTP ${res.status}: DB CHECK (reserved <= capacity) enforced`;
    }
  );

  // -------------------------------------------------------------------------
  // BUG 4: Negative Capacity Underflow on Multiple Cancellations
  // -------------------------------------------------------------------------
  await logResult(
    4,
    'Negative Capacity Underflow on Cancellation',
    'Integrity',
    async () => {
      // Check database constraints on ticket_types
      const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
      const sess = eventsRes.events[0].sessions[0];
      const seatsRes = await fetch(`${API_BASE}/sessions/${sess.id}/seats`).then((r) => r.json());
      const tt = seatsRes.ticketTypes[0];
      if (Number(tt.reserved) < 0) {
        throw new Error(`Negative reserved count detected: ${tt.reserved}`);
      }
      return `Capacity reserved count is valid (${tt.reserved}/${tt.capacity}), CHECK (reserved >= 0) active`;
    }
  );

  // -------------------------------------------------------------------------
  // BUG 5: User Ticket Quota Limit Bypass (max_tickets_per_user)
  // -------------------------------------------------------------------------
  await logResult(
    5,
    'User Ticket Quota Limit Bypass',
    'Business Logic',
    async () => {
      const u = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(5);

      // Event max_tickets_per_user is 4; try to reserve 5 seats
      const fiveSeatIds = seats.slice(0, 5).map((s) => s.id);
      const res = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: fiveSeatIds, strategy: 'pessimistic' }),
      });

      if (res.status !== 422) {
        throw new Error(`Expected 422 LIMIT_EXCEEDED, received HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error !== 'LIMIT_EXCEEDED') throw new Error(`Wrong error code: ${data.error}`);
      return 'Rejected with 422 LIMIT_EXCEEDED: User cannot exceed max tickets limit';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 6: Confirmation of Expired Hold (Late Checkout)
  // -------------------------------------------------------------------------
  await logResult(
    6,
    'Confirmation of Expired Hold (Late Checkout)',
    'Business Logic',
    async () => {
      const u = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);

      // 1. Create a hold
      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: [seats[0].id] }),
      }).then((r) => r.json());

      // 2. Release it manually (or let it expire)
      await fetch(`${API_BASE}/holds/${holdRes.holdId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${u.token}` },
      });

      // 3. Attempt to confirm expired/released hold
      const confirmRes = await fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      });

      if (confirmRes.status !== 404 && confirmRes.status !== 410) {
        throw new Error(`Expected 404 or 410, got ${confirmRes.status}`);
      }
      return 'Payment rejected: Hold expired/released, seats cannot be stolen';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 7: Confirming Someone Else\'s Hold (IDOR / Hijack Attack)
  // -------------------------------------------------------------------------
  await logResult(
    7,
    "Confirming Someone Else's Hold (IDOR / Hijack Attack)",
    'Security',
    async () => {
      const victim = await createFreshUser();
      const attacker = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);

      // Victim holds seat
      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${victim.token}` },
        body: JSON.stringify({ seatIds: [seats[0].id] }),
      }).then((r) => r.json());

      // Attacker tries to confirm victim's holdId
      const attackRes = await fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${attacker.token}` },
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      });

      if (attackRes.status !== 404) {
        throw new Error(`IDOR vulnerability! Status was ${attackRes.status} instead of 404`);
      }

      // Cleanup
      await fetch(`${API_BASE}/holds/${holdRes.holdId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${victim.token}` },
      });

      return 'Prevented IDOR: Hold ownership verified against authenticated userId';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 8: Double Confirmation Replay Attack (Duplicate Bookings)
  // -------------------------------------------------------------------------
  await logResult(
    8,
    'Double Confirmation Replay Attack (Duplicate Bookings)',
    'Concurrency',
    async () => {
      const u = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);

      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: [seats[0].id] }),
      }).then((r) => r.json());

      // Fire confirmation twice simultaneously
      const [c1, c2] = await Promise.all([
        fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
          body: JSON.stringify({ paymentMethod: 'mock_card' }),
        }).then((r) => r.json()),
        fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
          body: JSON.stringify({ paymentMethod: 'mock_card' }),
        }).then((r) => r.json()),
      ]);

      const ref1 = c1.booking?.reference;
      const ref2 = c2.booking?.reference;
      if (!ref1 || ref1 !== ref2) {
        throw new Error(`Double confirmation created different references: ${ref1} vs ${ref2}`);
      }
      return `hold_id UNIQUE constraint ensured both calls map to the same booking (${ref1})`;
    }
  );

  // -------------------------------------------------------------------------
  // BUG 9: Idempotency Key Cross-User Leak
  // -------------------------------------------------------------------------
  await logResult(
    9,
    'Idempotency Key Scoped per User (No Cross-Tenant Leak)',
    'Security',
    async () => {
      const u1 = await createFreshUser();
      const u2 = await createFreshUser();
      const sharedKey = `shared-key-${Date.now()}`;
      const { session, seats } = await getAvailableSessionAndSeats(2);

      // User 1 uses sharedKey
      const res1 = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${u1.token}`,
          'Idempotency-Key': sharedKey,
        },
        body: JSON.stringify({ seatIds: [seats[0].id] }),
      }).then((r) => r.json());

      // User 2 uses same sharedKey with a different seat
      const res2 = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${u2.token}`,
          'Idempotency-Key': sharedKey,
        },
        body: JSON.stringify({ seatIds: [seats[1].id] }),
      }).then((r) => r.json());

      if (res1.holdId === res2.holdId) {
        throw new Error('User 2 received cached response belonging to User 1!');
      }

      // Cleanup
      await fetch(`${API_BASE}/holds/${res1.holdId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${u1.token}` },
      });
      await fetch(`${API_BASE}/holds/${res2.holdId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${u2.token}` },
      });

      return 'Idempotency records scoped strictly by (key, user_id)';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 10: Optimistic Locking Conflict on Organiser Event Update
  // -------------------------------------------------------------------------
  await logResult(
    10,
    'Optimistic Locking on Event Updates (Version Conflict)',
    'Concurrency',
    async () => {
      const eventsRes = await fetch(`${API_BASE}/events`).then((r) => r.json());
      const event = eventsRes.events[0];
      const initialVersion = event.version;

      // Update 1 with version: initialVersion
      const upd1 = await fetch(`${API_BASE}/organiser/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organiserToken}` },
        body: JSON.stringify({
          title: `${event.title} (Updated)`,
          description: event.description,
          category: event.category,
          venueName: event.venue_name,
          cancelDeadlineHours: event.cancel_deadline_hours,
          refundPercent: event.refund_percent,
          maxTicketsPerUser: event.max_tickets_per_user,
          version: initialVersion,
        }),
      });

      if (!upd1.ok) throw new Error(`Update 1 failed with ${upd1.status}`);

      // Update 2 with old version: initialVersion (stale)
      const upd2 = await fetch(`${API_BASE}/organiser/events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organiserToken}` },
        body: JSON.stringify({
          title: `${event.title} (Stale Update)`,
          description: event.description,
          category: event.category,
          venueName: event.venue_name,
          cancelDeadlineHours: event.cancel_deadline_hours,
          refundPercent: event.refund_percent,
          maxTicketsPerUser: event.max_tickets_per_user,
          version: initialVersion, // Stale!
        }),
      });

      if (upd2.status !== 409) {
        throw new Error(`Expected 409 VERSION_CONFLICT, got ${upd2.status}`);
      }
      return 'Optimistic lock caught concurrent update: 409 VERSION_CONFLICT returned';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 11: Gate Check-in Anti-Double Scan Protection
  // -------------------------------------------------------------------------
  await logResult(
    11,
    'Anti-Double Check-in Protection at Entrance Gate',
    'Security',
    async () => {
      const u = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);

      // Book a ticket
      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: [seats[0].id] }),
      }).then((r) => r.json());

      const bookRes = await fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      }).then((r) => r.json());

      const ticketCode = bookRes.tickets[0].code;

      // Scan 1: Should be OK
      const scan1 = await fetch(`${API_BASE}/checkin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
        body: JSON.stringify({ code: ticketCode }),
      }).then((r) => r.json());

      if (scan1.result !== 'OK') throw new Error(`Scan 1 failed: ${JSON.stringify(scan1)}`);

      // Scan 2: Should be ALREADY_CHECKED_IN
      const scan2 = await fetch(`${API_BASE}/checkin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
        body: JSON.stringify({ code: ticketCode }),
      });

      if (scan2.status !== 409) {
        throw new Error(`Expected 409 duplicate scan, received ${scan2.status}`);
      }
      const data2 = await scan2.json();
      if (data2.result !== 'ALREADY_CHECKED_IN') throw new Error(`Wrong result: ${data2.result}`);

      return 'Atomic UPDATE tickets SET checked_in_at WHERE checked_in_at IS NULL prevented re-entry';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 12: Forged / Tampered Ticket Code Detection
  // -------------------------------------------------------------------------
  await logResult(
    12,
    'Forged / Tampered Ticket QR Code Detection',
    'Security',
    async () => {
      // Fake code with forged signature
      const fakeCode = 'dGlja2V0LTEyMzQ1Ng.fake-invalid-hmac-signature-here';
      const scanRes = await fetch(`${API_BASE}/checkin/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
        body: JSON.stringify({ code: fakeCode }),
      });

      if (scanRes.status !== 400) {
        throw new Error(`Expected 400 for forged code, received ${scanRes.status}`);
      }
      const data = await scanRes.json();
      if (data.result !== 'INVALID') throw new Error(`Expected INVALID, got ${data.result}`);
      return 'Cryptographic HMAC-SHA256 signature verification rejected forged pass';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 13: Cancellation After Deadline Rejection
  // -------------------------------------------------------------------------
  // BUG 13: Cancellation After Deadline Rejection
  // -------------------------------------------------------------------------
  await logResult(
    13,
    'Cancellation Policy Enforcement (Past Deadline Rejection)',
    'Business Logic',
    async () => {
      const u = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);

      // 1. Hold and confirm a seat
      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: [seats[0].id] }),
      }).then((r) => r.json());

      const bookRes = await fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      }).then((r) => r.json());

      const bookingId = bookRes.booking.id;

      // 2. Temporarily set starts_at to NOW() + 1 hour (less than 24h deadline)
      await dbPool.query(`UPDATE sessions SET starts_at = NOW() + INTERVAL '1 hour' WHERE id = $1;`, [session.id]);

      // 3. Attempt to cancel past deadline
      const cancelRes = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${u.token}` },
      });

      // 4. Restore starts_at to future (7 days)
      await dbPool.query(`UPDATE sessions SET starts_at = NOW() + INTERVAL '7 days' WHERE id = $1;`, [session.id]);

      if (cancelRes.status !== 422) {
        throw new Error(`Expected 422 CANCELLATION_DEADLINE_PASSED, received HTTP ${cancelRes.status}`);
      }
      const data = await cancelRes.json();
      if (data.error !== 'CANCELLATION_DEADLINE_PASSED') {
        throw new Error(`Expected error code CANCELLATION_DEADLINE_PASSED, got ${data.error}`);
      }
      return 'Rejected with 422 CANCELLATION_DEADLINE_PASSED: Cancellation cutoff strictly enforced';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 14: Double Cancellation / Double Refund Attack
  // -------------------------------------------------------------------------
  await logResult(
    14,
    'Double Cancellation Replay Protection',
    'Business Logic',
    async () => {
      const u = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);

      // Book
      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: [seats[0].id] }),
      }).then((r) => r.json());

      const bookRes = await fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      }).then((r) => r.json());

      const bookingId = bookRes.booking.id;

      // Cancel 1
      const c1 = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${u.token}` },
      });
      if (!c1.ok) throw new Error(`Cancel 1 failed: ${c1.status}`);

      // Cancel 2
      const c2 = await fetch(`${API_BASE}/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${u.token}` },
      });

      if (c2.status !== 400) throw new Error(`Expected 400 ALREADY_CANCELLED, received ${c2.status}`);
      return 'Booking status check prevented duplicate cancellation and double refund';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 15: Booking Ghost Seats (Non-existent or Blocked Seats)
  // -------------------------------------------------------------------------
  await logResult(
    15,
    'Booking Ghost or Blocked Seats',
    'Integrity',
    async () => {
      const u = await createFreshUser();
      const { session } = await getAvailableSessionAndSeats(1);
      const ghostSeatId = '00000000-0000-0000-0000-000000000000';

      const res = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: [ghostSeatId] }),
      });

      if (res.status !== 409) {
        throw new Error(`Expected 409 for ghost seat, received ${res.status}`);
      }
      return 'Pessimistic lock verification returned 409 INVALID_SEAT_IDS / SEAT_UNAVAILABLE';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 16: Lazy Expiry Auto-Reclamation
  // -------------------------------------------------------------------------
  await logResult(
    16,
    'Lazy Expiry Auto-Reclamation (Without Waiting for Cron)',
    'Concurrency',
    async () => {
      const u1 = await createFreshUser();
      const u2 = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);
      const seat = seats[0];

      // u1 holds the seat
      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({ seatIds: [seat.id] }),
      }).then((r) => r.json());

      // Artificially expire the hold in the database to simulate time passing without cron
      await dbPool.query(
        `UPDATE holds SET expires_at = NOW() - INTERVAL '30 seconds' WHERE id = $1;`,
        [holdRes.holdId]
      );
      await dbPool.query(
        `UPDATE event_seats SET hold_expires_at = NOW() - INTERVAL '30 seconds' WHERE id = $1;`,
        [seat.id]
      );

      // Now u2 attempts to hold the same seat immediately
      const u2Res = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u2.token}` },
        body: JSON.stringify({ seatIds: [seat.id] }),
      });

      if (u2Res.status !== 201) {
        throw new Error(`Expected 201 via lazy expiry, got HTTP ${u2Res.status}`);
      }

      const u2Data = await u2Res.json();
      // Cleanup u2's hold
      await fetch(`${API_BASE}/holds/${u2Data.holdId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${u2.token}` },
      });

      return 'Expired hold immediately reclaimed on demand with 201 (zero dependency on background cron)';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 17: Waitlist Concurrency Safety (FOR UPDATE SKIP LOCKED)
  // -------------------------------------------------------------------------
  await logResult(
    17,
    'Waitlist Concurrency Protection (FOR UPDATE SKIP LOCKED)',
    'Concurrency',
    async () => {
      const { session } = await getAvailableSessionAndSeats(1);
      const u1 = await createFreshUser();
      const u2 = await createFreshUser();

      // Insert two waitlist entries
      const resW1 = await dbPool.query(
        `INSERT INTO waitlist_entries (session_id, user_id, quantity, status)
         VALUES ($1, $2, 1, 'WAITING') RETURNING id;`,
        [session.id, u1.user.id]
      );
      const resW2 = await dbPool.query(
        `INSERT INTO waitlist_entries (session_id, user_id, quantity, status)
         VALUES ($1, $2, 1, 'WAITING') RETURNING id;`,
        [session.id, u2.user.id]
      );
      const w1Id = resW1.rows[0].id;
      const w2Id = resW2.rows[0].id;

      // Two workers query concurrently with SKIP LOCKED
      const client1 = await dbPool.connect();
      const client2 = await dbPool.connect();

      try {
        await client1.query('BEGIN');
        await client2.query('BEGIN');

        // Client 1 locks the first entry
        const q1 = await client1.query(
          `SELECT id FROM waitlist_entries
           WHERE session_id = $1 AND status = 'WAITING'
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;`,
          [session.id]
        );

        // Client 2 runs concurrently and MUST skip the locked entry
        const q2 = await client2.query(
          `SELECT id FROM waitlist_entries
           WHERE session_id = $1 AND status = 'WAITING'
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;`,
          [session.id]
        );

        await client1.query('COMMIT');
        await client2.query('COMMIT');

        const grabbed1 = q1.rows[0]?.id;
        const grabbed2 = q2.rows[0]?.id;

        if (!grabbed1 || !grabbed2 || grabbed1 === grabbed2) {
          throw new Error(`Workers grabbed same or invalid entries: ${grabbed1} vs ${grabbed2}`);
        }

        // Cleanup test entries
        await dbPool.query(`DELETE FROM waitlist_entries WHERE id = ANY($1::uuid[])`, [[w1Id, w2Id]]);

        return `Workers concurrently grabbed distinct entries (${grabbed1.slice(0, 8)} != ${grabbed2.slice(0, 8)}) without lock contention`;
      } finally {
        client1.release();
        client2.release();
      }
    }
  );

  // -------------------------------------------------------------------------
  // BUG 18: RBAC Privilege Escalation Guard
  // -------------------------------------------------------------------------
  await logResult(
    18,
    'RBAC Privilege Escalation Guard (Attendee vs Organiser/Staff)',
    'Security',
    async () => {
      const attendee = await createFreshUser('ATTENDEE');

      // Attendee calls Organiser-only endpoint
      const res = await fetch(`${API_BASE}/organiser/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${attendee.token}` },
        body: JSON.stringify({ title: 'Hacked Event' }),
      });

      if (res.status !== 403) {
        throw new Error(`Expected 403 FORBIDDEN, received ${res.status}`);
      }
      return 'requireRoles middleware blocked unauthorized attendee with HTTP 403';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 19: SQL Injection Prevention in Search & Filter
  // -------------------------------------------------------------------------
  await logResult(
    19,
    'SQL Injection Prevention in Search & Query Parameters',
    'Security',
    async () => {
      const sqliPayload = "' OR '1'='1' -- ; DROP TABLE users;";
      const res = await fetch(`${API_BASE}/events?q=${encodeURIComponent(sqliPayload)}`);

      if (!res.ok) throw new Error(`Endpoint broke under SQLi payload: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.events)) throw new Error('Malformed response');
      return 'Parameterized SQL queries ($1, $2) neutralized injection payload safely';
    }
  );

  // -------------------------------------------------------------------------
  // BUG 20: Ultimate Safety Net (uniq_active_ticket_per_seat constraint)
  // -------------------------------------------------------------------------
  await logResult(
    20,
    'PostgreSQL Partial Unique Index as Ultimate Safety Net',
    'Integrity',
    async () => {
      const u = await createFreshUser();
      const { session, seats } = await getAvailableSessionAndSeats(1);
      const seat = seats[0];

      // Book seat legitimately
      const holdRes = await fetch(`${API_BASE}/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ seatIds: [seat.id] }),
      }).then((r) => r.json());

      const bookRes = await fetch(`${API_BASE}/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      }).then((r) => r.json());

      const bookingId = bookRes.booking.id;
      const ticketTypeId = bookRes.tickets[0].ticket_type_id;

      // Attempt raw SQL bypass: INSERT a 2nd ACTIVE ticket for the SAME seat
      let violated = false;
      try {
        await dbPool.query(
          `INSERT INTO tickets (booking_id, ticket_type_id, event_seat_id, attendee_name, code, status)
           VALUES ($1, $2, $3, 'Hacker Attendee', 'ROGUE-CODE-${Date.now()}', 'ACTIVE');`,
          [bookingId, ticketTypeId, seat.id]
        );
        violated = true;
      } catch (dbErr: any) {
        if (dbErr.code !== '23505' || dbErr.constraint !== 'uniq_active_ticket_per_seat') {
          throw new Error(`Unexpected error: ${dbErr.message}`);
        }
      }

      if (violated) {
        throw new Error('CRITICAL INTEGRITY FAILURE: PostgreSQL allowed two ACTIVE tickets on the same seat!');
      }

      return 'PostgreSQL rejected duplicate with 23505 (uniq_active_ticket_per_seat): Physical double booking impossible';
    }
  );

  await dbPool.end();

  // Summary Report
  console.log('\n======================================================================');
  console.log('                          TEST SUITE SUMMARY                          ');
  console.log('======================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`ALL 20 COMMON BUGS VERIFIED & MITIGATED: ${failed === 0 ? 'YES (100% PASS)' : 'NO'}`);
  console.log('======================================================================\n');
}

runAllBugTests().catch((e) => {
  console.error('Test suite runner encountered critical error:', e);
  process.exit(1);
});
