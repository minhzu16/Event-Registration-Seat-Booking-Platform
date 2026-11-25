import { query, withTransaction } from '../database.js';
import { DomainHttpError } from '../errors.js';
import type { UserRole } from '../middleware/auth.js';
import type {
  CancelBookingRow,
  PaymentWebhookInput,
  RollingPassResult,
  RollingPassTicketRow,
  UserBookingRow,
  UserBookingView,
  WebhookResult,
} from '../types/bookings.types.js';
import { attachQrCodes, confirmHold } from './booking-confirm.service.js';
import { generateQrDataUrl, generateRollingPassCode, ROLLING_WINDOW_SECONDS } from './qr.js';
import { realtimeHub } from './realtime.js';
import { triggerWaitlistOffer } from './worker.js';

export { confirmHold };

const WEBHOOK_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/** Fetch all bookings and enriched tickets with QR codes for a user. */
export async function getUserBookings(userId: string): Promise<UserBookingView[]> {
  const bookingsRes = await query<UserBookingRow>(
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

  return Promise.all(
    bookingsRes.rows.map(async (b) => ({
      ...b,
      tickets: await attachQrCodes(b.tickets || []),
    }))
  );
}

/** Cancel a booking within deadline, release seats or GA capacity, and trigger waitlist offer. */
export async function cancelBooking(
  bookingId: string,
  userId: string
): Promise<{ message: string; refundAmount: number; refundPercent: number }> {
  const bookingRes = await query<CancelBookingRow>(
    `SELECT b.*, s.starts_at, e.cancel_deadline_hours, e.refund_percent, e.seating_mode
     FROM bookings b
     JOIN sessions s ON b.session_id = s.id
     JOIN events e ON s.event_id = e.id
     WHERE b.id = $1 AND b.user_id = $2;`,
    [bookingId, userId]
  );

  if (!bookingRes.rowCount || bookingRes.rowCount === 0) {
    throw new DomainHttpError(404, 'BOOKING_NOT_FOUND');
  }

  const booking = bookingRes.rows[0];
  if (booking.status === 'CANCELLED') {
    throw new DomainHttpError(400, 'ALREADY_CANCELLED', 'Booking is already cancelled');
  }

  const sessionStart = new Date(booking.starts_at);
  const deadlineHours = booking.cancel_deadline_hours;
  const cancelCutoff = new Date(sessionStart.getTime() - deadlineHours * 60 * 60 * 1000);
  if (new Date() > cancelCutoff) {
    throw new DomainHttpError(
      422,
      'CANCELLATION_DEADLINE_PASSED',
      `Cancellation deadline was ${deadlineHours} hours before event start (${cancelCutoff.toISOString()}).`
    );
  }

  const refundAmount = (Number(booking.total_amount) * booking.refund_percent) / 100;
  const freedSeats = await withTransaction(async (client) => {
    const ticketsRes = await client.query<{
      id: string;
      event_seat_id: string | null;
      ticket_type_id: string;
    }>(
      `UPDATE tickets SET status = 'CANCELLED' WHERE booking_id = $1
       RETURNING id, event_seat_id, ticket_type_id;`,
      [bookingId]
    );

    await client.query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1;`, [
      bookingId,
    ]);

    const seatIds = ticketsRes.rows.map((t) => t.event_seat_id).filter((id): id is string => Boolean(id));
    if (seatIds.length > 0) {
      await client.query(
        `UPDATE event_seats
         SET status = 'AVAILABLE', hold_id = NULL, hold_expires_at = NULL, version = version + 1
         WHERE id = ANY($1::uuid[]);`,
        [seatIds]
      );
    } else {
      for (const t of ticketsRes.rows) {
        await client.query(
          `UPDATE ticket_types SET reserved = GREATEST(0, reserved - 1) WHERE id = $1;`,
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
  await triggerWaitlistOffer(booking.session_id);

  return {
    message: 'Booking cancelled successfully',
    refundAmount,
    refundPercent: booking.refund_percent,
  };
}

/** Generate a dynamic anti-scalping SafeTix rolling QR pass for a ticket owner or staff/admin. */
export async function getTicketRollingPass(
  ticketId: string,
  userId: string,
  userRole: UserRole
): Promise<RollingPassResult> {
  const ticketRes = await query<RollingPassTicketRow>(
    `SELECT t.id, t.code, t.status, t.checked_in_at, b.user_id,
            t.attendee_name, tt.name as tier_name
     FROM tickets t
     JOIN bookings b ON t.booking_id = b.id
     JOIN ticket_types tt ON t.ticket_type_id = tt.id
     WHERE t.id = $1;`,
    [ticketId]
  );

  if (!ticketRes.rowCount || ticketRes.rowCount === 0) {
    throw new DomainHttpError(404, 'TICKET_NOT_FOUND');
  }

  const ticket = ticketRes.rows[0];
  if (ticket.user_id !== userId && userRole !== 'ADMIN' && userRole !== 'STAFF') {
    throw new DomainHttpError(403, 'FORBIDDEN');
  }

  const rolling = generateRollingPassCode(ticket.id, ROLLING_WINDOW_SECONDS);
  const qrDataUrl = await generateQrDataUrl(rolling.code);

  return {
    ticketId: ticket.id,
    status: ticket.status,
    checkedInAt: ticket.checked_in_at,
    attendeeName: ticket.attendee_name,
    tierName: ticket.tier_name,
    rollingCode: rolling.code,
    qrDataUrl,
    expiresAt: rolling.expiresAt,
    remainingSeconds: rolling.remainingSeconds,
    windowSeconds: ROLLING_WINDOW_SECONDS,
  };
}

async function recordWebhookIdempotency(webhookKey: string, action: 'RELEASED' | 'CONFIRMED'): Promise<void> {
  await query(
    `INSERT INTO idempotency_records (key, user_id, status_code, response_body)
     VALUES ($1, '${WEBHOOK_SYSTEM_USER_ID}', 200, $2);`,
    [webhookKey, JSON.stringify({ received: true, action })]
  );
}

/** Reconcile asynchronous payment webhook notifications idempotently. */
export async function processPaymentWebhook(data: PaymentWebhookInput): Promise<WebhookResult> {
  const webhookKey = `webhook:${data.transactionId}`;
  const existing = await query<{ key: string }>(
    `SELECT * FROM idempotency_records WHERE key = $1 AND user_id = '${WEBHOOK_SYSTEM_USER_ID}'`,
    [webhookKey]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return { received: true, status: 'ALREADY_PROCESSED' };
  }

  if (data.status === 'FAILED') {
    const holdRes = await query<{ session_id: string }>('SELECT session_id FROM holds WHERE id = $1', [
      data.holdId,
    ]);
    if (holdRes.rowCount && holdRes.rowCount > 0) {
      const sessionId = holdRes.rows[0].session_id;
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE event_seats
           SET status = 'AVAILABLE', hold_id = NULL, hold_expires_at = NULL, version = version + 1
           WHERE hold_id = $1;`,
          [data.holdId]
        );
        await client.query(`DELETE FROM holds WHERE id = $1;`, [data.holdId]);
      });
      realtimeHub.broadcast(sessionId, 'seat_released', {
        holdId: data.holdId,
        reason: 'PAYMENT_FAILED',
      });
    }

    await recordWebhookIdempotency(webhookKey, 'RELEASED');
    return { received: true, action: 'RELEASED' };
  }

  await recordWebhookIdempotency(webhookKey, 'CONFIRMED');
  return { received: true, action: 'CONFIRMED', transactionId: data.transactionId };
}
