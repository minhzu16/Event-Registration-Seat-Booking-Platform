import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../database.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { realtimeHub } from '../services/realtime.js';
import { triggerWaitlistOffer } from '../services/worker.js';
import { findBestAdjacentSeats } from '../services/adjacent-seats.js';
import { virtualWaitingRoom } from '../services/waiting-room.js';
import { config } from '../config.js';

const router = Router();

// GET /sessions/:id/seats - Get seat layout and live statuses
router.get('/sessions/:id/seats', optionalAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id;
    const currentUserId = req.user?.id;

    // Fetch session and event info
    const sessionRes = await query(
      `SELECT s.*, e.title as event_title, e.seating_mode, e.max_tickets_per_user
       FROM sessions s
       JOIN events e ON s.event_id = e.id
       WHERE s.id = $1;`,
      [sessionId]
    );

    if (!sessionRes.rowCount || sessionRes.rowCount === 0) {
      res.status(404).json({ error: 'SESSION_NOT_FOUND' });
      return;
    }

    const session = sessionRes.rows[0];

    // Fetch seats with ticket type details
    const seatsRes = await query(
      `SELECT es.id, es.section, es.row_label, es.seat_number, es.x, es.y,
              es.status, es.hold_id, es.hold_expires_at, es.version,
              tt.id as ticket_type_id, tt.name as tier_name, tt.price, tt.color,
              h.user_id as hold_user_id
       FROM event_seats es
       JOIN ticket_types tt ON es.ticket_type_id = tt.id
       LEFT JOIN holds h ON es.hold_id = h.id
       WHERE es.session_id = $1
       ORDER BY es.section ASC, es.row_label ASC, es.seat_number ASC;`,
      [sessionId]
    );

    const now = new Date();

    // Compute live status with lazy expiry
    const seats = seatsRes.rows.map((seat) => {
      let liveStatus = seat.status;

      // Lazy expiry: if HELD but expired, consider AVAILABLE
      if (seat.status === 'HELD' && seat.hold_expires_at && new Date(seat.hold_expires_at) < now) {
        liveStatus = 'AVAILABLE';
      }

      const isHeldByMe = currentUserId && seat.hold_user_id === currentUserId && liveStatus === 'HELD';

      return {
        id: seat.id,
        section: seat.section,
        rowLabel: seat.row_label,
        seatNumber: seat.seat_number,
        x: seat.x,
        y: seat.y,
        status: liveStatus,
        tierName: seat.tier_name,
        price: Number(seat.price),
        color: seat.color,
        ticketTypeId: seat.ticket_type_id,
        isHeldByMe: Boolean(isHeldByMe),
        holdExpiresAt: isHeldByMe ? seat.hold_expires_at : undefined,
      };
    });

    // Also fetch GA ticket types if GA mode
    const ticketTypesRes = await query(
      `SELECT id, name, price, capacity, reserved, color
       FROM ticket_types
       WHERE session_id = $1
       ORDER BY price DESC;`,
      [sessionId]
    );

    res.json({
      session,
      seats,
      ticketTypes: ticketTypesRes.rows,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Get Seats Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /sessions/:id/seats/suggest - Suggest best contiguous adjacent seats (F19)
router.get('/sessions/:id/seats/suggest', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id;
    const quantity = Number(req.query.quantity || 2);
    const tierId = req.query.tierId as string | undefined;

    const suggestion = await findBestAdjacentSeats(sessionId, quantity, tierId);

    if (!suggestion) {
      res.status(404).json({
        error: 'NO_ADJACENT_SEATS_FOUND',
        message: `Could not find ${quantity} contiguous seats together. Please select individual seats or try a smaller group.`,
      });
      return;
    }

    res.json({ suggestion });
  } catch (error) {
    console.error('[Suggest Seats Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /sessions/:id/stream - Server-Sent Events stream for live seat changes
router.get('/sessions/:id/stream', (req: Request, res: Response): void => {
  const sessionId = req.params.id;
  realtimeHub.subscribe(sessionId, res);
});

// POST /sessions/:id/queue/join - Join Virtual Waiting Room for Flash Sales (F17)
router.post(
  '/sessions/:id/queue/join',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;
      const userId = req.user!.id;
      const result = virtualWaitingRoom.joinQueue(sessionId, userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// GET /sessions/:id/queue/status - Check Virtual Waiting Room position & admission
router.get(
  '/sessions/:id/queue/status',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;
      const userId = req.user!.id;
      const status = virtualWaitingRoom.getQueueStatus(sessionId, userId);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// POST /sessions/:id/holds - Create a seat hold (or GA capacity hold)
const holdRequestSchema = z.object({
  seatIds: z.array(z.string().uuid()).optional(),
  ticketTypeId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).default(1),
  strategy: z.enum(['pessimistic', 'conditional', 'naive']).optional(),
});

router.post(
  '/sessions/:id/holds',
  authMiddleware,
  idempotencyMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;
      const userId = req.user!.id;
      const data = holdRequestSchema.parse(req.body);
      const strategy = data.strategy || config.BOOKING_STRATEGY;

      // 1. Verify session exists and sales are open
      const sessionRes = await query(
        `SELECT s.*, e.max_tickets_per_user, e.seating_mode
         FROM sessions s
         JOIN events e ON s.event_id = e.id
         WHERE s.id = $1;`,
        [sessionId]
      );

      if (!sessionRes.rowCount || sessionRes.rowCount === 0) {
        res.status(404).json({ error: 'SESSION_NOT_FOUND' });
        return;
      }
      const session = sessionRes.rows[0];

      // 2. Check user ticket limit (tickets already active + existing active holds)
      const existingCountRes = await query(
        `SELECT (
           SELECT count(*) FROM tickets t
           JOIN bookings b ON t.booking_id = b.id
           WHERE b.user_id = $1 AND b.session_id = $2 AND t.status = 'ACTIVE'
         ) + (
           SELECT count(*) FROM event_seats es
           JOIN holds h ON es.hold_id = h.id
           WHERE h.user_id = $1 AND h.session_id = $2 AND h.expires_at > now()
         ) as total_reserved;`,
        [userId, sessionId]
      );

      const currentHeldCount = Number(existingCountRes.rows[0]?.total_reserved || 0);
      const requestedCount = data.seatIds ? data.seatIds.length : data.quantity;

      if (currentHeldCount + requestedCount > session.max_tickets_per_user) {
        res.status(422).json({
          error: 'LIMIT_EXCEEDED',
          message: `You cannot reserve more than ${session.max_tickets_per_user} tickets for this event. (Currently held/booked: ${currentHeldCount})`,
        });
        return;
      }

      const holdDurationMinutes = config.DEFAULT_HOLD_MINUTES;
      const expiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);

      // ----------------------------------------------------
      // GENERAL ADMISSION HOLD (CAPACITY BASED)
      // ----------------------------------------------------
      if (session.seating_mode === 'GA' || (!data.seatIds && data.ticketTypeId)) {
        if (!data.ticketTypeId) {
          res.status(400).json({ error: 'MISSING_TICKET_TYPE', message: 'ticketTypeId is required for GA hold' });
          return;
        }

        const gaResult = await withTransaction(async (client) => {
          // Atomic capacity update
          const updateRes = await client.query(
            `UPDATE ticket_types
             SET reserved = reserved + $1
             WHERE id = $2 AND session_id = $3 AND (reserved + $1 <= capacity)
             RETURNING id, name, price, capacity, reserved;`,
            [data.quantity, data.ticketTypeId, sessionId]
          );

          if (updateRes.rowCount === 0) {
            return null; // Sold out
          }

          // Create hold
          const holdRes = await client.query(
            `INSERT INTO holds (user_id, session_id, expires_at)
             VALUES ($1, $2, $3)
             RETURNING id;`,
            [userId, sessionId, expiresAt]
          );

          return {
            holdId: holdRes.rows[0].id,
            ticketType: updateRes.rows[0],
          };
        });

        if (!gaResult) {
          res.status(409).json({
            error: 'CAPACITY_FULL',
            message: 'Requested quantity exceeds available capacity. Please join the waitlist.',
          });
          return;
        }

        realtimeHub.broadcast(sessionId, 'capacity_updated', {
          ticketTypeId: data.ticketTypeId,
          reserved: gaResult.ticketType.reserved,
          capacity: gaResult.ticketType.capacity,
        });

        res.status(201).json({
          holdId: gaResult.holdId,
          expiresAt: expiresAt.toISOString(),
          serverNow: new Date().toISOString(),
          quantity: data.quantity,
          ticketTypeId: data.ticketTypeId,
        });
        return;
      }

      // ----------------------------------------------------
      // RESERVED SEATING HOLD (EXACT SEATS)
      // ----------------------------------------------------
      const seatIds = data.seatIds;
      if (!seatIds || seatIds.length === 0) {
        res.status(400).json({ error: 'NO_SEATS_SELECTED', message: 'seatIds array cannot be empty' });
        return;
      }

      // ----------------------------------------------------
      // STRATEGY 1: PESSIMISTIC LOCK (SELECT ... FOR UPDATE ORDER BY id)
      // Recommended: all-or-nothing, deadlock-free (sorted IDs)
      // ----------------------------------------------------
      if (strategy === 'pessimistic') {
        const result = await withTransaction(async (client) => {
          // 1. Lock rows in fixed ascending order to prevent deadlocks
          const lockRes = await client.query(
            `SELECT id, status, hold_id, hold_expires_at
             FROM event_seats
             WHERE session_id = $1 AND id = ANY($2::uuid[])
             ORDER BY id ASC
             FOR UPDATE;`,
            [sessionId, seatIds]
          );

          if (lockRes.rowCount !== seatIds.length) {
            return { success: false, reason: 'INVALID_SEAT_IDS' };
          }

          const nowTime = new Date();
          const unavailableSeats: string[] = [];

          for (const seat of lockRes.rows) {
            const isAvailable =
              seat.status === 'AVAILABLE' ||
              (seat.status === 'HELD' && seat.hold_expires_at && new Date(seat.hold_expires_at) < nowTime);

            if (!isAvailable) {
              unavailableSeats.push(seat.id);
            }
          }

          if (unavailableSeats.length > 0) {
            return { success: false, reason: 'SEAT_UNAVAILABLE', unavailableSeats };
          }

          // 2. All seats verified free! Create Hold
          const holdRes = await client.query(
            `INSERT INTO holds (user_id, session_id, expires_at)
             VALUES ($1, $2, $3)
             RETURNING id;`,
            [userId, sessionId, expiresAt]
          );
          const holdId = holdRes.rows[0].id;

          // 3. Atomically update seat status
          await client.query(
            `UPDATE event_seats
             SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
             WHERE id = ANY($3::uuid[]);`,
            [holdId, expiresAt, seatIds]
          );

          return { success: true, holdId };
        });

        if (!result.success) {
          res.status(409).json({
            error: result.reason,
            message: 'One or more selected seats are no longer available.',
            unavailableSeats: result.unavailableSeats,
          });
          return;
        }

        realtimeHub.broadcast(sessionId, 'seat_held', {
          seatIds,
          holdId: result.holdId,
          expiresAt: expiresAt.toISOString(),
        });

        res.status(201).json({
          holdId: result.holdId,
          expiresAt: expiresAt.toISOString(),
          serverNow: new Date().toISOString(),
          seatIds,
          strategy: 'pessimistic',
        });
        return;
      }

      // ----------------------------------------------------
      // STRATEGY 2: CONDITIONAL UPDATE (Compare-and-set)
      // Atomic single-query CAS
      // ----------------------------------------------------
      if (strategy === 'conditional') {
        const result = await withTransaction(async (client) => {
          const holdRes = await client.query(
            `INSERT INTO holds (user_id, session_id, expires_at)
             VALUES ($1, $2, $3)
             RETURNING id;`,
            [userId, sessionId, expiresAt]
          );
          const holdId = holdRes.rows[0].id;

          // Attempt conditional update on all requested seats
          const updateRes = await client.query(
            `UPDATE event_seats
             SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
             WHERE session_id = $3
               AND id = ANY($4::uuid[])
               AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < now()))
             RETURNING id;`,
            [holdId, expiresAt, sessionId, seatIds]
          );

          if (updateRes.rowCount !== seatIds.length) {
            // Not all seats were available -> Rollback!
            throw new Error('CONDITIONAL_UPDATE_CONFLICT');
          }

          return { holdId };
        }).catch((err) => {
          if (err.message === 'CONDITIONAL_UPDATE_CONFLICT') {
            return null;
          }
          throw err;
        });

        if (!result) {
          res.status(409).json({
            error: 'SEAT_UNAVAILABLE',
            message: 'One or more selected seats were seized by another attendee.',
            strategy: 'conditional',
          });
          return;
        }

        realtimeHub.broadcast(sessionId, 'seat_held', {
          seatIds,
          holdId: result.holdId,
          expiresAt: expiresAt.toISOString(),
        });

        res.status(201).json({
          holdId: result.holdId,
          expiresAt: expiresAt.toISOString(),
          serverNow: new Date().toISOString(),
          seatIds,
          strategy: 'conditional',
        });
        return;
      }

      // ----------------------------------------------------
      // STRATEGY 3: NAIVE (No Lock - Intentional Race Condition for Demonstration)
      // Shows classic lost update / double booking
      // ----------------------------------------------------
      if (strategy === 'naive') {
        // 1. Read without lock
        const checkRes = await query(
          `SELECT id, status FROM event_seats WHERE session_id = $1 AND id = ANY($2::uuid[])`,
          [sessionId, seatIds]
        );

        const available = checkRes.rows.every((s) => s.status === 'AVAILABLE');
        if (!available) {
          res.status(409).json({ error: 'SEAT_UNAVAILABLE', strategy: 'naive' });
          return;
        }

        // Simulating processing delay to expose race condition
        await new Promise((resolve) => setTimeout(resolve, 30));

        // 2. Blind write without atomic check
        const holdRes = await query(
          `INSERT INTO holds (user_id, session_id, expires_at)
           VALUES ($1, $2, $3)
           RETURNING id;`,
          [userId, sessionId, expiresAt]
        );
        const holdId = holdRes.rows[0].id;

        await query(
          `UPDATE event_seats
           SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
           WHERE id = ANY($3::uuid[]);`,
          [holdId, expiresAt, seatIds]
        );

        realtimeHub.broadcast(sessionId, 'seat_held', {
          seatIds,
          holdId,
          expiresAt: expiresAt.toISOString(),
        });

        res.status(201).json({
          holdId,
          expiresAt: expiresAt.toISOString(),
          serverNow: new Date().toISOString(),
          seatIds,
          strategy: 'naive',
        });
        return;
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
        return;
      }
      console.error('[Hold Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// DELETE /holds/:id - Manually release a hold
router.delete('/holds/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const holdId = req.params.id;
    const userId = req.user!.id;

    const holdRes = await query('SELECT * FROM holds WHERE id = $1 AND user_id = $2', [holdId, userId]);
    if (holdRes.rowCount === 0) {
      res.status(404).json({ error: 'HOLD_NOT_FOUND' });
      return;
    }
    const hold = holdRes.rows[0];

    const seatsRes = await query(
      `UPDATE event_seats
       SET status = 'AVAILABLE', hold_id = NULL, hold_expires_at = NULL, version = version + 1
       WHERE hold_id = $1
       RETURNING id;`,
      [holdId]
    );

    await query('DELETE FROM holds WHERE id = $1', [holdId]);

    const releasedIds = seatsRes.rows.map((r) => r.id);
    if (releasedIds.length > 0) {
      realtimeHub.broadcast(hold.session_id, 'seat_released', {
        seatIds: releasedIds,
        reason: 'USER_CANCELLED',
      });
      await triggerWaitlistOffer(hold.session_id);
    }

    res.json({ message: 'Hold released successfully', releasedSeats: releasedIds });
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
