import { Router, Request, Response } from 'express';
import { query } from '../database.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';

const router = Router();

// GET /organiser/sessions/:id/reports/attendance - Attendance summary & graph data
router.get(
  '/organiser/sessions/:id/reports/attendance',
  authMiddleware,
  requireRoles('ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;

      // 1. General totals
      const totalsRes = await query(
        `SELECT
           count(t.id) as total_tickets,
           count(t.checked_in_at) as checked_in_count,
           sum(CASE WHEN t.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_tickets,
           sum(CASE WHEN t.status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_tickets,
           coalesce(sum(tt.price), 0) as total_revenue
         FROM tickets t
         JOIN bookings b ON t.booking_id = b.id
         JOIN ticket_types tt ON t.ticket_type_id = tt.id
         WHERE b.session_id = $1;`,
        [sessionId]
      );
      const totals = totalsRes.rows[0];

      // 2. Breakdown by ticket type
      const tierRes = await query(
        `SELECT
           tt.name, tt.price, tt.color,
           count(t.id) as tickets_sold,
           count(t.checked_in_at) as checked_in
         FROM ticket_types tt
         LEFT JOIN tickets t ON tt.id = t.ticket_type_id AND t.status = 'ACTIVE'
         WHERE tt.session_id = $1
         GROUP BY tt.id, tt.name, tt.price, tt.color
         ORDER BY tt.price DESC;`,
        [sessionId]
      );

      // 3. Check-ins curve grouped by 15-minute intervals
      const timeSeriesRes = await query(
        `SELECT
           date_trunc('hour', t.checked_in_at) +
             interval '15 min' * floor(date_part('minute', t.checked_in_at) / 15) as interval_time,
           count(*) as count
         FROM tickets t
         JOIN bookings b ON t.booking_id = b.id
         WHERE b.session_id = $1 AND t.checked_in_at IS NOT NULL
         GROUP BY interval_time
         ORDER BY interval_time ASC;`,
        [sessionId]
      );

      // 4. Waitlist metrics
      const waitlistRes = await query(
        `SELECT
           count(*) as total_waitlisted,
           sum(CASE WHEN status = 'CONVERTED' THEN 1 ELSE 0 END) as converted_count,
           sum(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END) as currently_waiting
         FROM waitlist_entries
         WHERE session_id = $1;`,
        [sessionId]
      );

      const totalSold = Number(totals.active_tickets || 0);
      const checkedIn = Number(totals.checked_in_count || 0);
      const fillRate = totalSold > 0 ? Math.round((checkedIn / totalSold) * 100) : 0;

      res.json({
        summary: {
          totalTickets: totalSold,
          checkedIn,
          noShows: Math.max(0, totalSold - checkedIn),
          cancelledTickets: Number(totals.cancelled_tickets || 0),
          fillRatePercent: fillRate,
          totalRevenue: Number(totals.total_revenue || 0),
        },
        tierBreakdown: tierRes.rows,
        timeSeries: timeSeriesRes.rows,
        waitlist: waitlistRes.rows[0],
      });
    } catch (error) {
      console.error('[Attendance Report Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// GET /organiser/sessions/:id/attendees - Attendee list and CSV export
router.get(
  '/organiser/sessions/:id/attendees',
  authMiddleware,
  requireRoles('ORGANISER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.id;
      const format = req.query.format;

      const listRes = await query(
        `SELECT
           t.id as ticket_id,
           t.attendee_name,
           u.email as purchaser_email,
           u.phone as purchaser_phone,
           b.reference as booking_reference,
           tt.name as tier_name,
           tt.price,
           es.section,
           es.row_label,
           es.seat_number,
           t.status as ticket_status,
           t.checked_in_at,
           b.created_at as booked_at
         FROM tickets t
         JOIN bookings b ON t.booking_id = b.id
         JOIN users u ON b.user_id = u.id
         JOIN ticket_types tt ON t.ticket_type_id = tt.id
         LEFT JOIN event_seats es ON t.event_seat_id = es.id
         WHERE b.session_id = $1
         ORDER BY t.checked_in_at DESC NULLS LAST, t.attendee_name ASC;`,
        [sessionId]
      );

      if (format === 'csv') {
        const rows = listRes.rows;
        const csvHeaders = [
          'Attendee Name',
          'Purchaser Email',
          'Phone',
          'Booking Reference',
          'Tier',
          'Price',
          'Section',
          'Row',
          'Seat',
          'Ticket Status',
          'Checked In At',
          'Booked At',
        ];

        const csvLines = [csvHeaders.join(',')];
        for (const r of rows) {
          const seatLabel = r.section ? `${r.section} - Row ${r.row_label} Seat ${r.seat_number}` : 'General Admission';
          const checkedInStr = r.checked_in_at ? new Date(r.checked_in_at).toISOString() : 'NOT_CHECKED_IN';

          csvLines.push(
            [
              `"${r.attendee_name.replace(/"/g, '""')}"`,
              `"${r.purchaser_email}"`,
              `"${r.purchaser_phone || ''}"`,
              `"${r.booking_reference}"`,
              `"${r.tier_name}"`,
              r.price,
              `"${r.section || 'GA'}"`,
              `"${r.row_label || 'GA'}"`,
              r.seat_number || '',
              r.ticket_status,
              `"${checkedInStr}"`,
              `"${new Date(r.booked_at).toISOString()}"`,
            ].join(',')
          );
        }

        const csvContent = csvLines.join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="attendees-${sessionId}.csv"`);
        res.send(csvContent);
        return;
      }

      res.json({ attendees: listRes.rows });
    } catch (error) {
      console.error('[Export Attendees Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

export default router;
