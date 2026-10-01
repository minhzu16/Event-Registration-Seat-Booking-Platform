import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query, withTransaction } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { signTicketCode, generateQrDataUrl } from '../services/qr.js';
import { realtimeHub } from '../services/realtime.js';
import { triggerWaitlistOffer } from '../services/worker.js';
import { sendBookingConfirmationEmail } from '../services/email.js';

const router = Router();

function generateReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'EVT-';
  for (let i = 0; i < 6; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

// POST /holds/:id/confirm - Confirm hold and issue tickets
const confirmSchema = z.object({
  paymentMethod: z.enum(['mock_card', 'free', 'momo', 'vnpay']).default('mock_card'),
  simulateFailure: z.boolean().optional(),
  attendeeNames: z.record(z.string()).optional(), // seatId -> attendee name
});

router.post(
  '/holds/:id/confirm',
  authMiddleware,
  idempotencyMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const holdId = req.params.id;
      const userId = req.user!.id;
      const data = confirmSchema.parse(req.body);

      if (data.simulateFailure) {
        res.status(402).json({ error: 'PAYMENT_FAILED', message: 'Simulated payment processing error' });
        return;
      }

      // 1. Fetch hold and verify ownership & expiration
      const holdRes = await query(
        `SELECT h.*, s.event_id, s.starts_at, e.title as event_title, e.seating_mode,
                e.venue_name, e.cancel_deadline_hours, e.refund_percent
         FROM holds h
         JOIN sessions s ON h.session_id = s.id
         JOIN events e ON s.event_id = e.id
         WHERE h.id = $1 AND h.user_id = $2;`,
        [holdId, userId]
      );

      if (!holdRes.rowCount || holdRes.rowCount === 0) {
        res.status(404).json({ error: 'HOLD_NOT_FOUND', message: 'Hold not found or unauthorized' });
        return;
      }

      const hold = holdRes.rows[0];
      if (new Date(hold.expires_at) < new Date()) {
        res.status(410).json({
          error: 'HOLD_EXPIRED',
          message: 'Your hold has expired. The seats have been released back to inventory.',
        });
        return;
      }

      // Check if hold already converted to booking
      const existingBooking = await query('SELECT * FROM bookings WHERE hold_id = $1', [holdId]);
      if (existingBooking.rowCount && existingBooking.rowCount > 0) {
        const booking = existingBooking.rows[0];
        const ticketsRes = await query('SELECT * FROM tickets WHERE booking_id = $1', [booking.id]);
        const ticketsWithQr = await Promise.all(
          ticketsRes.rows.map(async (t) => ({
            ...t,
            qrDataUrl: await generateQrDataUrl(t.code),
          }))
        );
        res.json({
          booking,
          tickets: ticketsWithQr,
          message: 'Booking already confirmed',
        });
        return;
      }

      // 2. Transaction: Confirm seats and issue tickets
      const result = await withTransaction(async (client) => {
        // Lock hold row to serialize any concurrent confirm calls
        await client.query('SELECT id FROM holds WHERE id = $1 FOR UPDATE;', [holdId]);

        // Check if hold was converted to booking while waiting for lock
        const txExisting = await client.query('SELECT * FROM bookings WHERE hold_id = $1;', [holdId]);
        if (txExisting.rowCount && txExisting.rowCount > 0) {
          const booking = txExisting.rows[0];
          const ticketsRes = await client.query('SELECT * FROM tickets WHERE booking_id = $1;', [booking.id]);
          return { booking, tickets: ticketsRes.rows, bookedSeatRows: [] };
        }

        let bookedSeatRows: any[] = [];
        let totalAmount = 0;
        const ticketItems: Array<{
          ticketTypeId: string;
          seatId: string | null;
          attendeeName: string;
        }> = [];

        if (hold.seating_mode === 'RESERVED') {
          // Atomically convert seats from HELD to BOOKED
          const seatUpdateRes = await client.query(
            `UPDATE event_seats
             SET status = 'BOOKED', hold_expires_at = NULL, version = version + 1
             WHERE hold_id = $1 AND status = 'HELD' AND hold_expires_at > now()
             RETURNING id, ticket_type_id, section, row_label, seat_number;`,
            [holdId]
          );

          if (seatUpdateRes.rowCount === 0) {
            throw new Error('HOLD_ALREADY_EXPIRED');
          }

          bookedSeatRows = seatUpdateRes.rows;

          // Fetch prices
          const typeIds = bookedSeatRows.map((s) => s.ticket_type_id);
          const typesRes = await client.query(
            `SELECT id, price FROM ticket_types WHERE id = ANY($1::uuid[]);`,
            [typeIds]
          );
          const priceMap = new Map<string, number>();
          for (const t of typesRes.rows) {
            priceMap.set(t.id, Number(t.price));
          }

          for (const s of bookedSeatRows) {
            const price = priceMap.get(s.ticket_type_id) || 0;
            totalAmount += price;
            const name = (data.attendeeNames && data.attendeeNames[s.id]) || req.user!.fullName;
            ticketItems.push({
              ticketTypeId: s.ticket_type_id,
              seatId: s.id,
              attendeeName: name,
            });
          }
        } else {
          // General Admission
          // Hold already reserved capacity count in ticket_types
          // We can find if waitlist converted or normal GA
          const ttRes = await client.query(
            `SELECT id, price FROM ticket_types WHERE session_id = $1 LIMIT 1;`,
            [hold.session_id]
          );
          const tt = ttRes.rows[0];
          totalAmount = Number(tt?.price || 0);
          ticketItems.push({
            ticketTypeId: tt.id,
            seatId: null,
            attendeeName: req.user!.fullName,
          });
        }

        // 3. Create Booking record
        const bookingRef = generateReference();
        const bookingRes = await client.query(
          `INSERT INTO bookings (user_id, session_id, hold_id, status, total_amount, reference)
           VALUES ($1, $2, $3, 'CONFIRMED', $4, $5)
           RETURNING *;`,
          [userId, hold.session_id, holdId, totalAmount, bookingRef]
        );
        const booking = bookingRes.rows[0];

        // 4. Create Tickets with HMAC signed code
        const tickets: any[] = [];
        for (const item of ticketItems) {
          const ticketId = crypto.randomUUID();
          const signedCode = signTicketCode(ticketId);

          const ticketRes = await client.query(
            `INSERT INTO tickets (id, booking_id, ticket_type_id, event_seat_id, attendee_name, code, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
             RETURNING *;`,
            [ticketId, booking.id, item.ticketTypeId, item.seatId, item.attendeeName, signedCode]
          );
          tickets.push(ticketRes.rows[0]);
        }

        // Mark waitlist entry if applicable
        await client.query(
          `UPDATE waitlist_entries
           SET status = 'CONVERTED'
           WHERE offer_hold_id = $1;`,
          [holdId]
        );

        return { booking, tickets, bookedSeatRows };
      });

      // 5. Broadcast booked seats to all listeners
      if (result.bookedSeatRows.length > 0) {
        realtimeHub.broadcast(hold.session_id, 'seat_booked', {
          seatIds: result.bookedSeatRows.map((s) => s.id),
          bookingReference: result.booking.reference,
        });
      }

      // 6. Generate QR codes for immediate display
      const ticketsWithQr = await Promise.all(
        result.tickets.map(async (t) => {
          const qrDataUrl = await generateQrDataUrl(t.code);
          return {
            ...t,
            qrDataUrl,
          };
        })
      );

      // 7. Dispatch rich HTML confirmation email asynchronously
      sendBookingConfirmationEmail(
        req.user!.email,
        {
          title: hold.event_title,
          venue_name: hold.venue_name || 'Main Auditorium',
          starts_at: hold.starts_at,
          cancel_deadline_hours: hold.cancel_deadline_hours,
          refund_percent: hold.refund_percent,
        },
        {
          reference: result.booking.reference,
          total_amount: result.booking.total_amount,
        },
        ticketsWithQr
      ).catch((e) => console.error('[Email Dispatch Warning]', e));

      res.status(201).json({
        booking: result.booking,
        tickets: ticketsWithQr,
        message: 'Booking confirmed successfully!',
      });
    } catch (error: any) {
      if (error.message === 'HOLD_ALREADY_EXPIRED') {
        res.status(410).json({ error: 'HOLD_EXPIRED', message: 'Hold expired during checkout' });
        return;
      }
      if (error.code === '23505' && error.constraint === 'uniq_active_ticket_per_seat') {
        // Ultimate database safety net fired!
        console.error('[CRITICAL INTEGRITY RESCUE] uniq_active_ticket_per_seat triggered!', error);
        res.status(409).json({
          error: 'SEAT_ALREADY_BOOKED',
          message: 'Database integrity constraint prevented double booking. Seat has already been booked.',
        });
        return;
      }
      console.error('[Confirm Booking Error]', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// GET /me/bookings - Get current attendee's bookings and tickets
router.get('/me/bookings', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const bookingsRes = await query(
      `SELECT b.*,
              e.title as event_title, e.category, e.venue_name, e.cancel_deadline_hours, e.refund_percent,
              s.starts_at, s.ends_at,
              (SELECT json_agg(
                 json_build_object(
                   'id', t.id,
                   'code', t.code,
                   'status', t.status,
                   'attendeeName', t.attendee_name,
                   'checkedInAt', t.checked_in_at,
                   'ticketTypeName', tt.name,
                   'price', tt.price,
                   'seatSection', es.section,
                   'seatRow', es.row_label,
                   'seatNumber', es.seat_number
                 ) ORDER BY t.id ASC
               )
               FROM tickets t
               JOIN ticket_types tt ON t.ticket_type_id = tt.id
               LEFT JOIN event_seats es ON t.event_seat_id = es.id
               WHERE t.booking_id = b.id
              ) as tickets
       FROM bookings b
       JOIN sessions s ON b.session_id = s.id
       JOIN events e ON s.event_id = e.id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC;`,
      [userId]
    );

    // Generate QR Data URLs for tickets
    const bookings = await Promise.all(
      bookingsRes.rows.map(async (b) => {
        const tickets = b.tickets || [];
        const enrichedTickets = await Promise.all(
          tickets.map(async (t: any) => ({
            ...t,
            qrDataUrl: await generateQrDataUrl(t.code),
          }))
        );
        return {
          ...b,
          tickets: enrichedTickets,
        };
      })
    );

    res.json({ bookings });
  } catch (error) {
    console.error('[Get Bookings Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// POST /bookings/:id/cancel - Cancel booking according to event policy
router.post('/bookings/:id/cancel', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = req.params.id;
    const userId = req.user!.id;

    const bookingRes = await query(
      `SELECT b.*, s.starts_at, e.cancel_deadline_hours, e.refund_percent, e.seating_mode
       FROM bookings b
       JOIN sessions s ON b.session_id = s.id
       JOIN events e ON s.event_id = e.id
       WHERE b.id = $1 AND b.user_id = $2;`,
      [bookingId, userId]
    );

    if (!bookingRes.rowCount || bookingRes.rowCount === 0) {
      res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
      return;
    }

    const booking = bookingRes.rows[0];
    if (booking.status === 'CANCELLED') {
      res.status(400).json({ error: 'ALREADY_CANCELLED', message: 'Booking is already cancelled' });
      return;
    }

    // Policy check: now < starts_at - cancel_deadline_hours
    const sessionStart = new Date(booking.starts_at);
    const deadlineHours = booking.cancel_deadline_hours;
    const cancelCutoff = new Date(sessionStart.getTime() - deadlineHours * 60 * 60 * 1000);

    if (new Date() > cancelCutoff) {
      res.status(422).json({
        error: 'CANCELLATION_DEADLINE_PASSED',
        message: `Cancellation deadline was ${deadlineHours} hours before event start (${cancelCutoff.toISOString()}).`,
      });
      return;
    }

    const refundAmount = (Number(booking.total_amount) * booking.refund_percent) / 100;

    const freedSeats = await withTransaction(async (client) => {
      // 1. Mark tickets cancelled
      const ticketsRes = await client.query(
        `UPDATE tickets
         SET status = 'CANCELLED'
         WHERE booking_id = $1
         RETURNING id, event_seat_id, ticket_type_id;`,
        [bookingId]
      );

      // 2. Mark booking cancelled
      await client.query(
        `UPDATE bookings
         SET status = 'CANCELLED', cancelled_at = now()
         WHERE id = $1;`,
        [bookingId]
      );

      // 3. Release reserved seats back to AVAILABLE
      const seatIds = ticketsRes.rows.map((t) => t.event_seat_id).filter(Boolean);
      if (seatIds.length > 0) {
        await client.query(
          `UPDATE event_seats
           SET status = 'AVAILABLE', hold_id = NULL, hold_expires_at = NULL, version = version + 1
           WHERE id = ANY($1::uuid[]);`,
          [seatIds]
        );
      } else {
        // GA: Decrement reserved count
        for (const t of ticketsRes.rows) {
          await client.query(
            `UPDATE ticket_types
             SET reserved = GREATEST(0, reserved - 1)
             WHERE id = $1;`,
            [t.ticket_type_id]
          );
        }
      }

      return seatIds;
    });

    if (freedSeats.length > 0) {
      realtimeHub.broadcast(booking.session_id, 'seat_released', {
        seatIds: freedSeats,
        reason: 'BOOKING_CANCELLED',
      });
    }

    // Trigger waitlist offer for newly freed capacity
    await triggerWaitlistOffer(booking.session_id);

    res.json({
      message: 'Booking cancelled successfully',
      refundAmount,
      refundPercent: booking.refund_percent,
    });
  } catch (error) {
    console.error('[Cancel Booking Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
