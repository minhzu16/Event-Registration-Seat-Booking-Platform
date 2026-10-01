import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../database.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';

const router = Router();

// Public: List & search events
router.get('/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, category, seating_mode, from, to } = req.query;

    let sql = `
      SELECT e.*, o.name as organiser_name,
        (SELECT json_agg(s ORDER BY s.starts_at ASC)
         FROM (
           SELECT id, starts_at, ends_at, sales_open_at, sales_close_at
           FROM sessions
           WHERE event_id = e.id
         ) s
        ) as sessions
      FROM events e
      JOIN organisers o ON e.organiser_id = o.id
      WHERE e.status = 'PUBLISHED'
    `;
    const params: any[] = [];

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (e.title ILIKE $${params.length} OR e.description ILIKE $${params.length})`;
    }
    if (category) {
      params.push(category);
      sql += ` AND e.category = $${params.length}`;
    }
    if (seating_mode) {
      params.push(seating_mode);
      sql += ` AND e.seating_mode = $${params.length}`;
    }

    sql += ` ORDER BY e.created_at DESC LIMIT 50;`;

    const result = await query(sql, params);
    res.json({ events: result.rows });
  } catch (error) {
    console.error('[Events List Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Public: Get event detail with sessions and ticket types
router.get('/events/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const eventRes = await query(
      `SELECT e.*, o.name as organiser_name, o.contact_email
       FROM events e
       JOIN organisers o ON e.organiser_id = o.id
       WHERE e.id = $1`,
      [id]
    );

    if (!eventRes.rowCount || eventRes.rowCount === 0) {
      res.status(404).json({ error: 'EVENT_NOT_FOUND' });
      return;
    }

    const sessionsRes = await query(
      `SELECT s.*,
        (SELECT json_agg(t ORDER BY t.price DESC)
         FROM (
           SELECT id, name, price, capacity, reserved, color
           FROM ticket_types
           WHERE session_id = s.id
         ) t
        ) as ticket_types
       FROM sessions s
       WHERE s.event_id = $1
       ORDER BY s.starts_at ASC`,
      [id]
    );

    res.json({
      event: eventRes.rows[0],
      sessions: sessionsRes.rows,
    });
  } catch (error) {
    console.error('[Event Detail Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Organiser: Create event
const createEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.string().default('Conference'),
  bannerUrl: z.string().optional(),
  venueName: z.string().default('Main Auditorium'),
  seatingMode: z.enum(['GA', 'RESERVED']),
  cancelDeadlineHours: z.number().default(48),
  refundPercent: z.number().min(0).max(100).default(100),
  maxTicketsPerUser: z.number().min(1).default(4),
  sessions: z.array(
    z.object({
      startsAt: z.string(),
      endsAt: z.string(),
      ticketTypes: z.array(
        z.object({
          name: z.string(),
          price: z.number().min(0),
          capacity: z.number().min(0).default(100),
          color: z.string().default('#6366f1'),
        })
      ),
    })
  ).min(1),
});

router.post(
  '/organiser/events',
  authMiddleware,
  requireRoles('ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const data = createEventSchema.parse(req.body);
      const userId = req.user!.id;

      // Find or create organiser profile
      let orgRes = await query('SELECT id FROM organisers WHERE owner_id = $1', [userId]);
      let orgId: string;
      if (orgRes.rowCount && orgRes.rowCount > 0) {
        orgId = orgRes.rows[0].id;
      } else {
        const newOrg = await query(
          'INSERT INTO organisers (name, contact_email, owner_id) VALUES ($1, $2, $3) RETURNING id',
          [`${req.user!.fullName}'s Organization`, req.user!.email, userId]
        );
        orgId = newOrg.rows[0].id;
      }

      const createdEvent = await withTransaction(async (client) => {
        const eventRes = await client.query(
          `INSERT INTO events (
            organiser_id, title, description, category, banner_url, venue_name,
            seating_mode, cancel_deadline_hours, refund_percent, max_tickets_per_user
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *;`,
          [
            orgId,
            data.title,
            data.description || null,
            data.category,
            data.bannerUrl || null,
            data.venueName,
            data.seatingMode,
            data.cancelDeadlineHours,
            data.refundPercent,
            data.maxTicketsPerUser,
          ]
        );

        const event = eventRes.rows[0];

        for (const sessionData of data.sessions) {
          const sessionRes = await client.query(
            `INSERT INTO sessions (event_id, starts_at, ends_at)
             VALUES ($1, $2, $3)
             RETURNING id;`,
            [event.id, sessionData.startsAt, sessionData.endsAt]
          );
          const sessionId = sessionRes.rows[0].id;

          for (const tt of sessionData.ticketTypes) {
            await client.query(
              `INSERT INTO ticket_types (session_id, name, price, capacity, color)
               VALUES ($1, $2, $3, $4, $5);`,
              [sessionId, tt.name, tt.price, tt.capacity, tt.color]
            );
          }
        }

        return event;
      });

      res.status(201).json({ event: createdEvent });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
        return;
      }
      console.error('[Create Event Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// Organiser: Update event with optimistic locking
const updateEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.string(),
  venueName: z.string(),
  cancelDeadlineHours: z.number(),
  refundPercent: z.number(),
  maxTicketsPerUser: z.number(),
  version: z.number(), // Optimistic lock version requirement
});

router.put(
  '/organiser/events/:id',
  authMiddleware,
  requireRoles('ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const data = updateEventSchema.parse(req.body);

      // Optimistic lock check: update WHERE id = $1 AND version = $expected
      const updateRes = await query(
        `UPDATE events
         SET title = $2, description = $3, category = $4, venue_name = $5,
             cancel_deadline_hours = $6, refund_percent = $7, max_tickets_per_user = $8,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $9
         RETURNING *;`,
        [
          id,
          data.title,
          data.description || null,
          data.category,
          data.venueName,
          data.cancelDeadlineHours,
          data.refundPercent,
          data.maxTicketsPerUser,
          data.version,
        ]
      );

      if (updateRes.rowCount === 0) {
        // Either event does not exist or version conflict
        const check = await query('SELECT version FROM events WHERE id = $1', [id]);
        if (check.rowCount === 0) {
          res.status(404).json({ error: 'EVENT_NOT_FOUND' });
          return;
        }
        res.status(409).json({
          error: 'VERSION_CONFLICT',
          message: 'The event was modified by another organiser. Please refresh and retry.',
          currentVersion: check.rows[0].version,
        });
        return;
      }

      res.json({ event: updateRes.rows[0] });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// Organiser: Generate Seat Map for a Session
const generateSeatMapSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string(), // e.g. "VIP Front", "Standard"
      ticketTypeId: z.string(),
      rows: z.number().min(1).max(26), // e.g. 5 rows (A..E)
      seatsPerRow: z.number().min(1).max(50), // e.g. 10 seats
      startX: z.number().default(40),
      startY: z.number().default(40),
    })
  ),
});

router.post(
  '/organiser/sessions/:id/seatmap',
  authMiddleware,
  requireRoles('ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;
      const data = generateSeatMapSchema.parse(req.body);

      const count = await withTransaction(async (client) => {
        // Clear existing seats for this session
        await client.query('DELETE FROM event_seats WHERE session_id = $1', [sessionId]);

        let totalSeats = 0;
        const seatSpacing = 36;

        for (const sec of data.sections) {
          let currentY = sec.startY;
          for (let r = 0; r < sec.rows; r++) {
            const rowLabel = String.fromCharCode(65 + r); // A, B, C...
            let currentX = sec.startX;

            for (let s = 1; s <= sec.seatsPerRow; s++) {
              await client.query(
                `INSERT INTO event_seats (
                  session_id, ticket_type_id, section, row_label, seat_number, x, y, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE')
                ON CONFLICT (session_id, section, row_label, seat_number) DO NOTHING;`,
                [sessionId, sec.ticketTypeId, sec.name, rowLabel, s, currentX, currentY]
              );
              totalSeats++;
              currentX += seatSpacing;
            }
            currentY += seatSpacing;
          }
        }
        return totalSeats;
      });

      res.status(201).json({ message: 'Seat map generated successfully', seatsGenerated: count });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
        return;
      }
      console.error('[Generate Seatmap Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// Organiser: Block or Unblock a seat
router.patch(
  '/organiser/seats/:id/block',
  authMiddleware,
  requireRoles('ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { block } = req.body; // boolean

      const targetStatus = block ? 'BLOCKED' : 'AVAILABLE';
      const checkStatus = block ? 'AVAILABLE' : 'BLOCKED';

      const resUpdate = await query(
        `UPDATE event_seats
         SET status = $1, version = version + 1
         WHERE id = $2 AND status = $3
         RETURNING id, session_id, status;`,
        [targetStatus, id, checkStatus]
      );

      if (resUpdate.rowCount === 0) {
        res.status(409).json({ error: 'SEAT_STATE_CONFLICT', message: 'Seat cannot be toggled from current state' });
        return;
      }

      res.json({ seat: resUpdate.rows[0] });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

export default router;
