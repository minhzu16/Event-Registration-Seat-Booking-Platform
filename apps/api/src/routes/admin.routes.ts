import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../database.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// GET /admin/integrity/:sessionId - Run comprehensive SQL integrity checks
export async function runIntegrityCheck(sessionId: string) {
  // Query 1: Seats with multiple active tickets (Double booking!)
  const doubleBookingsRes = await query(
    `SELECT event_seat_id, count(*) as active_ticket_count
     FROM tickets t
     JOIN bookings b ON t.booking_id = b.id
     WHERE b.session_id = $1 AND t.status = 'ACTIVE' AND t.event_seat_id IS NOT NULL
     GROUP BY event_seat_id
     HAVING count(*) > 1;`,
    [sessionId]
  );

  // Query 2: Inconsistent state (Seat is BOOKED but has no active ticket, or active ticket on non-BOOKED seat)
  const inconsistentSeatsRes = await query(
    `SELECT s.id as seat_id, s.section, s.row_label, s.seat_number, s.status as seat_status,
            t.id as ticket_id, t.status as ticket_status
     FROM event_seats s
     FULL OUTER JOIN tickets t ON t.event_seat_id = s.id AND t.status = 'ACTIVE'
     WHERE s.session_id = $1 AND ((s.status = 'BOOKED') <> (t.id IS NOT NULL));`,
    [sessionId]
  );

  // Query 3: GA capacity violations
  const capacityViolationsRes = await query(
    `SELECT id, name, capacity, reserved
     FROM ticket_types
     WHERE session_id = $1 AND reserved > capacity;`,
    [sessionId]
  );

  const doubleBookingCount = doubleBookingsRes.rowCount || 0;
  const inconsistentCount = inconsistentSeatsRes.rowCount || 0;
  const capacityViolationCount = capacityViolationsRes.rowCount || 0;
  const totalViolations = doubleBookingCount + inconsistentCount + capacityViolationCount;

  return {
    status: totalViolations === 0 ? 'PASSED' : 'VIOLATIONS_FOUND',
    totalViolations,
    doubleBookings: doubleBookingsRes.rows,
    inconsistentSeats: inconsistentSeatsRes.rows,
    capacityViolations: capacityViolationsRes.rows,
    timestamp: new Date().toISOString(),
  };
}

router.get('/admin/integrity/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const report = await runIntegrityCheck(sessionId);
    res.json(report);
  } catch (error) {
    console.error('[Integrity Check Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// POST /admin/simulate/ticket-drop - Concurrent ticket-drop benchmark simulation
const simulateSchema = z.object({
  sessionId: z.string().uuid(),
  targetSeatIds: z.array(z.string().uuid()).min(1),
  concurrentRequests: z.number().int().min(1).max(1000).default(100),
  strategy: z.enum(['pessimistic', 'conditional', 'naive']).default('pessimistic'),
});

router.post('/admin/simulate/ticket-drop', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = simulateSchema.parse(req.body);
    const { sessionId, targetSeatIds, concurrentRequests, strategy } = data;

    // Delete any previous tickets and pending holds for the targeted test seats
    await query(
      `DELETE FROM tickets WHERE event_seat_id = ANY($1::uuid[]);`,
      [targetSeatIds]
    );

    // Reset targeted seats to AVAILABLE for a clean test
    await query(
      `UPDATE event_seats
       SET status = 'AVAILABLE', hold_id = NULL, hold_expires_at = NULL, version = 0
       WHERE id = ANY($1::uuid[]);`,
      [targetSeatIds]
    );

    // Delete any pending holds for this session
    await query(
      `DELETE FROM holds
       WHERE session_id = $1 AND id NOT IN (SELECT hold_id FROM bookings WHERE hold_id IS NOT NULL);`,
      [sessionId]
    );

    // Ensure we have test users
    const testUsersRes = await query(
      `SELECT id, email FROM users ORDER BY created_at ASC LIMIT 1;`
    );
    const baseUserId = testUsersRes.rows[0]?.id || crypto.randomUUID();

    const startTime = Date.now();
    const latencies: number[] = [];
    const results: Array<{ status: number; message?: string }> = [];

    // Simulate parallel concurrent requests firing simultaneously
    const requests = Array.from({ length: concurrentRequests }).map(async (_, index) => {
      // Pick 1 random seat or subset of seats
      const seatToHold = targetSeatIds[index % targetSeatIds.length];
      const reqStart = Date.now();
      const simulatedUserId = baseUserId;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      try {
        if (strategy === 'pessimistic') {
          const outcome = await withTransaction(async (client) => {
            const lockRes = await client.query(
              `SELECT id, status, hold_expires_at
               FROM event_seats
               WHERE session_id = $1 AND id = $2
               FOR UPDATE;`,
              [sessionId, seatToHold]
            );

            const seat = lockRes.rows[0];
            const isAvail =
              seat &&
              (seat.status === 'AVAILABLE' ||
                (seat.status === 'HELD' && seat.hold_expires_at && new Date(seat.hold_expires_at) < new Date()));

            if (!isAvail) {
              return { status: 409 };
            }

            const holdRes = await client.query(
              `INSERT INTO holds (user_id, session_id, expires_at) VALUES ($1, $2, $3) RETURNING id;`,
              [simulatedUserId, sessionId, expiresAt]
            );

            await client.query(
              `UPDATE event_seats
               SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
               WHERE id = $3;`,
              [holdRes.rows[0].id, expiresAt, seatToHold]
            );

            return { status: 201 };
          });

          latencies.push(Date.now() - reqStart);
          results.push(outcome);
        } else if (strategy === 'conditional') {
          const outcome = await withTransaction(async (client) => {
            const holdRes = await client.query(
              `INSERT INTO holds (user_id, session_id, expires_at) VALUES ($1, $2, $3) RETURNING id;`,
              [simulatedUserId, sessionId, expiresAt]
            );

            const updRes = await client.query(
              `UPDATE event_seats
               SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
               WHERE id = $3 AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < now()))
               RETURNING id;`,
              [holdRes.rows[0].id, expiresAt, seatToHold]
            );

            if (updRes.rowCount === 0) {
              throw new Error('CONFLICT');
            }
            return { status: 201 };
          }).catch((err) => {
            if (err.message === 'CONFLICT') return { status: 409 };
            return { status: 500 };
          });

          latencies.push(Date.now() - reqStart);
          results.push(outcome);
        } else {
          // Naive (No Lock - deliberately produces race conditions!)
          const checkRes = await query(
            `SELECT status FROM event_seats WHERE id = $1;`,
            [seatToHold]
          );

          if (checkRes.rows[0]?.status !== 'AVAILABLE') {
            results.push({ status: 409 });
          } else {
            // Small artificial latency to expose lost updates
            await new Promise((r) => setTimeout(r, 10));

            const holdRes = await query(
              `INSERT INTO holds (user_id, session_id, expires_at) VALUES ($1, $2, $3) RETURNING id;`,
              [simulatedUserId, sessionId, expiresAt]
            );

            await query(
              `UPDATE event_seats SET status = 'HELD', hold_id = $1, hold_expires_at = $2 WHERE id = $3;`,
              [holdRes.rows[0].id, expiresAt, seatToHold]
            );
            results.push({ status: 201 });
          }
          latencies.push(Date.now() - reqStart);
        }
      } catch (err: any) {
        latencies.push(Date.now() - reqStart);
        results.push({ status: 500, message: err.message });
      }
    });

    await Promise.all(requests);
    const totalDuration = Date.now() - startTime;

    // Run SQL integrity check on the session
    const integrityReport = await runIntegrityCheck(sessionId);

    // Calculate latency percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

    const successfulHolds = results.filter((r) => r.status === 201).length;
    const conflicts = results.filter((r) => r.status === 409).length;
    const errors = results.filter((r) => r.status === 500).length;

    // Check how many unique seats were successfully held
    const heldSeatsRes = await query(
      `SELECT count(*) as count FROM event_seats WHERE id = ANY($1::uuid[]) AND status = 'HELD';`,
      [targetSeatIds]
    );
    const actualHeldSeatsCount = Number(heldSeatsRes.rows[0]?.count || 0);

    res.json({
      benchmark: {
        strategy,
        totalRequests: concurrentRequests,
        targetSeatsCount: targetSeatIds.length,
        actualHeldSeatsCount,
        successfulHolds,
        conflicts409: conflicts,
        errors500: errors,
        durationMs: totalDuration,
        throughputRps: Math.round((concurrentRequests / (totalDuration / 1000)) * 10) / 10,
        latencyMs: {
          avg: avgLatency,
          min: latencies[0] || 0,
          p50,
          p90,
          p99,
          max: latencies[latencies.length - 1] || 0,
        },
      },
      integrityReport,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    console.error('[Simulate Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
