import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, pool } from '../database.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';

const router = Router();
router.use('/admin', authMiddleware, requireRoles('ADMIN'));

const ROLES = ['ATTENDEE', 'ORGANISER', 'STAFF', 'ADMIN'] as const;
const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'ENDED'] as const;
const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: 'VALIDATION_ERROR', message });
}

function toUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone ?? null,
    createdAt: row.created_at,
  };
}

function toEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    venueName: row.venue_name,
    seatingMode: row.seating_mode,
    status: row.status,
    organiserName: row.organiser_name,
    createdAt: row.created_at,
    sessionCount: Number(row.session_count),
  };
}

// GET /admin/stats
router.get('/admin/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const [usersRes, eventsRes, bookingsRes, ticketsRes] = await Promise.all([
      query('SELECT role, count(*)::int AS n FROM users GROUP BY role'),
      query('SELECT status, count(*)::int AS n FROM events GROUP BY status'),
      query(`SELECT count(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed,
                    COALESCE(sum(total_amount) FILTER (WHERE status = 'CONFIRMED' AND created_at >= now() - interval '30 days'), 0) AS revenue30d
             FROM bookings`),
      query("SELECT count(*)::int AS active FROM tickets WHERE status = 'ACTIVE'"),
    ]);

    const byRole: Record<(typeof ROLES)[number], number> = {
      ATTENDEE: 0,
      ORGANISER: 0,
      STAFF: 0,
      ADMIN: 0,
    };
    let totalUsers = 0;
    for (const r of usersRes.rows) {
      const count = Number(r.n);
      if (r.role in byRole) {
        byRole[r.role as (typeof ROLES)[number]] = count;
      }
      totalUsers += count;
    }

    const byStatus: Record<(typeof EVENT_STATUSES)[number], number> = {
      DRAFT: 0,
      PUBLISHED: 0,
      CANCELLED: 0,
      ENDED: 0,
    };
    let totalEvents = 0;
    for (const r of eventsRes.rows) {
      const count = Number(r.n);
      if (r.status in byStatus) {
        byStatus[r.status as (typeof EVENT_STATUSES)[number]] = count;
      }
      totalEvents += count;
    }

    const bookingRow = bookingsRes.rows[0];
    const bookings = {
      confirmed: Number(bookingRow?.confirmed ?? 0),
      revenue30d: Number(bookingRow?.revenue30d ?? 0),
    };

    const ticketRow = ticketsRes.rows[0];
    const tickets = {
      active: Number(ticketRow?.active ?? 0),
    };

    res.json({
      users: { total: totalUsers, byRole },
      events: { total: totalEvents, byStatus },
      bookings,
      tickets,
    });
  } catch {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Admin query failed' });
  }
});

// GET /admin/users
router.get('/admin/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = listQuery.extend({ role: z.enum(ROLES).optional() }).safeParse(req.query);
    if (!parseResult.success) {
      badRequest(res, parseResult.error.issues[0]?.message || 'Invalid query parameters');
      return;
    }

    const { search, page, pageSize, role } = parseResult.data;
    const { rows } = await query(
      `SELECT id, email, full_name, role, phone, created_at, count(*) OVER()::int AS total
       FROM users
       WHERE ($1::text IS NULL OR email ILIKE $1 OR full_name ILIKE $1)
         AND ($2::user_role IS NULL OR role = $2)
       ORDER BY created_at DESC, id DESC
       LIMIT $3 OFFSET $4`,
      [search ? `%${escapeLike(search)}%` : null, role ?? null, pageSize, (page - 1) * pageSize]
    );

    let total = Number(rows[0]?.total ?? 0);
    if (rows.length === 0 && page > 1) {
      const countRes = await query(
        `SELECT count(*)::int AS total
         FROM users
         WHERE ($1::text IS NULL OR email ILIKE $1 OR full_name ILIKE $1)
           AND ($2::user_role IS NULL OR role = $2)`,
        [search ? `%${escapeLike(search)}%` : null, role ?? null]
      );
      total = Number(countRes.rows[0]?.total ?? 0);
    }

    res.json({
      items: rows.map(toUser),
      total,
      page,
      pageSize,
    });
  } catch {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Admin query failed' });
  }
});

// PATCH /admin/users/:id/role
router.patch('/admin/users/:id/role', async (req: Request, res: Response): Promise<void> => {
  try {
    const idParse = z.string().uuid().safeParse(req.params.id);
    if (!idParse.success) {
      badRequest(res, idParse.error.issues[0]?.message || 'Invalid user ID');
      return;
    }

    const bodyParse = z.object({ role: z.enum(ROLES) }).safeParse(req.body);
    if (!bodyParse.success) {
      badRequest(res, bodyParse.error.issues[0]?.message || 'Invalid role');
      return;
    }

    if (req.params.id === req.user!.id) {
      badRequest(res, 'You cannot change your own role');
      return;
    }

    const { role } = bodyParse.data;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('seatlock:admin-roster'))");
      const cur = await client.query('SELECT role FROM users WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
        return;
      } else if (cur.rows[0].role === 'ADMIN' && role !== 'ADMIN') {
        const others = await client.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND id <> $1", [req.params.id]);
        if (others.rows[0].n === 0) {
          await client.query('ROLLBACK');
          badRequest(res, 'At least one ADMIN must remain');
          return;
        }
      }

      const { rows } = await client.query(
        `UPDATE users SET role = $1, updated_at = now() WHERE id = $2
         RETURNING id, email, full_name, role, phone, created_at`,
        [role, req.params.id]
      );
      await client.query('COMMIT');
      res.status(200).json(toUser(rows[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Admin query failed' });
  }
});

// GET /admin/events
router.get('/admin/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = listQuery.extend({ status: z.enum(EVENT_STATUSES).optional() }).safeParse(req.query);
    if (!parseResult.success) {
      badRequest(res, parseResult.error.issues[0]?.message || 'Invalid query parameters');
      return;
    }

    const { search, page, pageSize, status } = parseResult.data;
    const { rows } = await query(
      `SELECT e.id, e.title, e.category, e.venue_name, e.seating_mode, e.status, e.created_at,
              o.name AS organiser_name,
              (SELECT count(*) FROM sessions s WHERE s.event_id = e.id) AS session_count,
              count(*) OVER()::int AS total
       FROM events e JOIN organisers o ON o.id = e.organiser_id
       WHERE ($1::text IS NULL OR e.title ILIKE $1 OR o.name ILIKE $1)
         AND ($2::text IS NULL OR e.status = $2)
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $3 OFFSET $4`,
      [search ? `%${escapeLike(search)}%` : null, status ?? null, pageSize, (page - 1) * pageSize]
    );

    let total = Number(rows[0]?.total ?? 0);
    if (rows.length === 0 && page > 1) {
      const countRes = await query(
        `SELECT count(*)::int AS total
         FROM events e JOIN organisers o ON o.id = e.organiser_id
         WHERE ($1::text IS NULL OR e.title ILIKE $1 OR o.name ILIKE $1)
           AND ($2::text IS NULL OR e.status = $2)`,
        [search ? `%${escapeLike(search)}%` : null, status ?? null]
      );
      total = Number(countRes.rows[0]?.total ?? 0);
    }

    res.json({
      items: rows.map(toEvent),
      total,
      page,
      pageSize,
    });
  } catch {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Admin query failed' });
  }
});

// PATCH /admin/events/:id/status
router.patch('/admin/events/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const idParse = z.string().uuid().safeParse(req.params.id);
    if (!idParse.success) {
      badRequest(res, idParse.error.issues[0]?.message || 'Invalid event ID');
      return;
    }

    const bodyParse = z.object({ status: z.enum(EVENT_STATUSES) }).safeParse(req.body);
    if (!bodyParse.success) {
      badRequest(res, bodyParse.error.issues[0]?.message || 'Invalid status');
      return;
    }

    const { status } = bodyParse.data;
    const { rows } = await query(
      `UPDATE events SET status = $1, version = version + 1, updated_at = now() WHERE id = $2
       RETURNING id, status, version`,
      [status, req.params.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
      return;
    }

    res.status(200).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Admin query failed' });
  }
});

export default router;
