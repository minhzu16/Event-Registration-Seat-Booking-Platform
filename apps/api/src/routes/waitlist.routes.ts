import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const waitlistSchema = z.object({
  ticketTypeId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(4).default(1),
});

// POST /sessions/:id/waitlist - Join waiting list
router.post(
  '/sessions/:id/waitlist',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;
      const userId = req.user!.id;
      const data = waitlistSchema.parse(req.body);

      // Verify session exists
      const sessionRes = await query('SELECT id FROM sessions WHERE id = $1', [sessionId]);
      if (sessionRes.rowCount === 0) {
        res.status(404).json({ error: 'SESSION_NOT_FOUND' });
        return;
      }

      // Check if already in waitlist
      const existing = await query(
        'SELECT * FROM waitlist_entries WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      if (existing.rowCount && existing.rowCount > 0) {
        res.status(409).json({
          error: 'ALREADY_WAITLISTED',
          message: 'You are already on the waiting list for this session',
          entry: existing.rows[0],
        });
        return;
      }

      const insertRes = await query(
        `INSERT INTO waitlist_entries (session_id, ticket_type_id, user_id, quantity, status)
         VALUES ($1, $2, $3, $4, 'WAITING')
         RETURNING *;`,
        [sessionId, data.ticketTypeId || null, userId, data.quantity]
      );

      // Compute queue position
      const posRes = await query(
        `SELECT count(*) as position
         FROM waitlist_entries
         WHERE session_id = $1 AND status = 'WAITING' AND created_at <= $2;`,
        [sessionId, insertRes.rows[0].created_at]
      );

      res.status(201).json({
        message: 'Successfully joined waiting list',
        entry: insertRes.rows[0],
        position: Number(posRes.rows[0]?.position || 1),
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
        return;
      }
      console.error('[Join Waitlist Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// GET /sessions/:id/waitlist/my - Check user's waitlist status & offers
router.get(
  '/sessions/:id/waitlist/my',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;
      const userId = req.user!.id;

      const entryRes = await query(
        `SELECT w.*, h.expires_at as hold_expires_at
         FROM waitlist_entries w
         LEFT JOIN holds h ON w.offer_hold_id = h.id
         WHERE w.session_id = $1 AND w.user_id = $2;`,
        [sessionId, userId]
      );

      if (entryRes.rowCount === 0) {
        res.json({ waitlisted: false });
        return;
      }

      const entry = entryRes.rows[0];
      let position: number | null = null;

      if (entry.status === 'WAITING') {
        const posRes = await query(
          `SELECT count(*) as position
           FROM waitlist_entries
           WHERE session_id = $1 AND status = 'WAITING' AND created_at <= $2;`,
          [sessionId, entry.created_at]
        );
        position = Number(posRes.rows[0]?.position || 1);
      }

      res.json({
        waitlisted: true,
        entry,
        position,
        hasActiveOffer: entry.status === 'OFFERED' && new Date(entry.offer_expires_at) > new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

export default router;
