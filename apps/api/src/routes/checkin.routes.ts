import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../database.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';
import { verifyTicketCode } from '../services/qr.js';

const router = Router();

const scanSchema = z.object({
  code: z.string().min(1),
  sessionId: z.string().uuid().optional(),
});

// POST /checkin/scan - Scan QR code at entrance
router.post(
  '/checkin/scan',
  authMiddleware,
  requireRoles('STAFF', 'ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const staffId = req.user!.id;
      const { code, sessionId } = scanSchema.parse(req.body);

      // 1. Verify HMAC signature offline first
      const verification = verifyTicketCode(code);
      if (!verification.valid) {
        res.status(400).json({
          result: 'INVALID',
          message: 'Invalid ticket code signature or corrupted QR data.',
        });
        return;
      }

      // 2. Atomic check-in update (anti-double check-in concurrency protection)
      const updateRes = await query(
        `UPDATE tickets
         SET checked_in_at = now()
         WHERE code = $1 AND status = 'ACTIVE' AND checked_in_at IS NULL
         RETURNING id, attendee_name, booking_id, ticket_type_id, event_seat_id, checked_in_at;`,
        [code]
      );

      if (updateRes.rowCount && updateRes.rowCount > 0) {
        const ticket = updateRes.rows[0];

        // Fetch detailed seat & session info
        const detailRes = await query(
          `SELECT t.id, t.attendee_name, t.checked_in_at,
                  tt.name as ticket_type_name,
                  es.section, es.row_label, es.seat_number,
                  s.id as session_id, s.starts_at, e.title as event_title
           FROM tickets t
           JOIN bookings b ON t.booking_id = b.id
           JOIN sessions s ON b.session_id = s.id
           JOIN events e ON s.event_id = e.id
           JOIN ticket_types tt ON t.ticket_type_id = tt.id
           LEFT JOIN event_seats es ON t.event_seat_id = es.id
           WHERE t.id = $1;`,
          [ticket.id]
        );

        const details = detailRes.rows[0];

        // Log successful checkin
        await query(
          `INSERT INTO checkins (ticket_id, staff_id, result)
           VALUES ($1, $2, 'OK');`,
          [ticket.id, staffId]
        );

        res.json({
          result: 'OK',
          message: 'Check-in successful! Welcome to the event.',
          attendee: details,
        });
        return;
      }

      // 3. Check failure reason
      const existingTicketRes = await query(
        `SELECT t.id, t.status, t.checked_in_at, t.attendee_name,
                es.section, es.row_label, es.seat_number
         FROM tickets t
         LEFT JOIN event_seats es ON t.event_seat_id = es.id
         WHERE t.code = $1;`,
        [code]
      );

      if (!existingTicketRes.rowCount || existingTicketRes.rowCount === 0) {
        res.status(404).json({
          result: 'INVALID',
          message: 'Ticket not found in database.',
        });
        return;
      }

      const existingTicket = existingTicketRes.rows[0];

      if (existingTicket.checked_in_at) {
        // Record duplicate checkin attempt
        await query(
          `INSERT INTO checkins (ticket_id, staff_id, result)
           VALUES ($1, $2, 'ALREADY_CHECKED_IN');`,
          [existingTicket.id, staffId]
        );

        res.status(409).json({
          result: 'ALREADY_CHECKED_IN',
          message: `Ticket already checked in at ${new Date(existingTicket.checked_in_at).toLocaleTimeString()}`,
          attendee: existingTicket,
        });
        return;
      }

      if (existingTicket.status !== 'ACTIVE') {
        res.status(400).json({
          result: 'INVALID',
          message: `Ticket is not active (Status: ${existingTicket.status})`,
          attendee: existingTicket,
        });
        return;
      }

      res.status(400).json({ result: 'INVALID', message: 'Unable to check in ticket' });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
        return;
      }
      console.error('[Checkin Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// GET /checkin/session/:sessionId/recent - Get latest scans
router.get(
  '/checkin/session/:sessionId/recent',
  authMiddleware,
  requireRoles('STAFF', 'ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const recentRes = await query(
        `SELECT c.*, t.attendee_name, tt.name as tier_name, es.section, es.row_label, es.seat_number,
                u.full_name as staff_name
         FROM checkins c
         JOIN tickets t ON c.ticket_id = t.id
         JOIN bookings b ON t.booking_id = b.id
         JOIN ticket_types tt ON t.ticket_type_id = tt.id
         LEFT JOIN event_seats es ON t.event_seat_id = es.id
         LEFT JOIN users u ON c.staff_id = u.id
         WHERE b.session_id = $1
         ORDER BY c.scanned_at DESC
         LIMIT 30;`,
        [sessionId]
      );

      res.json({ checkins: recentRes.rows });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

export default router;
