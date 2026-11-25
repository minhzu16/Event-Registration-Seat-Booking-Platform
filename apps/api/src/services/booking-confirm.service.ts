import crypto from 'crypto';
import type pg from 'pg';
import { query, withTransaction } from '../database.js';
import { DomainHttpError } from '../errors.js';
import type {
  BookedSeatRow,
  BookingRow,
  ConfirmHoldInput,
  ConfirmHoldResult,
  HoldWithEventRow,
  TicketIssueItem,
  TicketRow,
  TicketTypePriceRow,
} from '../types/bookings.types.js';
import { sendBookingConfirmationEmail } from './email.js';
import { generateQrDataUrl, signTicketCode } from './qr.js';
import { realtimeHub } from './realtime.js';

interface ConfirmTxResult {
  booking: BookingRow;
  tickets: TicketRow[];
  bookedSeatRows: BookedSeatRow[];
  typeNameMap: Map<string, string>;
}

function generateReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'EVT-';
  for (let i = 0; i < 6; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

/** Attach QR code data URLs to a list of ticket objects. */
export async function attachQrCodes<T extends { code: string }>(
  tickets: T[]
): Promise<Array<T & { qrDataUrl: string }>> {
  return Promise.all(
    tickets.map(async (t) => ({
      ...t,
      qrDataUrl: await generateQrDataUrl(t.code),
    }))
  );
}

async function prepareConfirmItems(
  client: pg.PoolClient,
  hold: HoldWithEventRow,
  input: ConfirmHoldInput
): Promise<{
  totalAmount: number;
  bookedSeatRows: BookedSeatRow[];
  ticketItems: TicketIssueItem[];
  typeNameMap: Map<string, string>;
}> {
  const typeNameMap = new Map<string, string>();

  if (hold.seating_mode === 'RESERVED') {
    const seatUpdateRes = await client.query<BookedSeatRow>(
      `UPDATE event_seats
       SET status = 'BOOKED', hold_expires_at = NULL, version = version + 1
       WHERE hold_id = $1 AND status = 'HELD' AND hold_expires_at > now()
       RETURNING id, ticket_type_id, section, row_label, seat_number;`,
      [input.holdId]
    );
    if (seatUpdateRes.rowCount === 0) {
      throw new DomainHttpError(410, 'HOLD_EXPIRED', 'Hold expired during checkout');
    }

    const bookedSeatRows = seatUpdateRes.rows;
    const typeIds = bookedSeatRows.map((s) => s.ticket_type_id);
    const typesRes = await client.query<TicketTypePriceRow>(
      `SELECT id, name, price FROM ticket_types WHERE id = ANY($1::uuid[]);`,
      [typeIds]
    );

    const priceMap = new Map<string, number>();
    for (const t of typesRes.rows) {
      priceMap.set(t.id, Number(t.price));
      typeNameMap.set(t.id, t.name);
    }

    let totalAmount = 0;
    const ticketItems: TicketIssueItem[] = bookedSeatRows.map((s) => {
      totalAmount += priceMap.get(s.ticket_type_id) || 0;
      const attendeeName = (input.attendeeNames && input.attendeeNames[s.id]) || input.userFullName;
      return { ticketTypeId: s.ticket_type_id, seatId: s.id, attendeeName };
    });

    return { totalAmount, bookedSeatRows, ticketItems, typeNameMap };
  }

  const ttRes = await client.query<TicketTypePriceRow>(
    `SELECT id, name, price FROM ticket_types WHERE session_id = $1 LIMIT 1;`,
    [hold.session_id]
  );
  const tt = ttRes.rows[0];
  if (!tt) {
    throw new Error(`No ticket type found for GA session ${hold.session_id}`);
  }
  typeNameMap.set(tt.id, tt.name);

  return {
    totalAmount: Number(tt.price || 0),
    bookedSeatRows: [],
    ticketItems: [{ ticketTypeId: tt.id, seatId: null, attendeeName: input.userFullName }],
    typeNameMap,
  };
}

async function runConfirmTransaction(
  hold: HoldWithEventRow,
  input: ConfirmHoldInput
): Promise<ConfirmTxResult> {
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM holds WHERE id = $1 FOR UPDATE;', [input.holdId]);

    const txExisting = await client.query<BookingRow>('SELECT * FROM bookings WHERE hold_id = $1;', [
      input.holdId,
    ]);
    if (txExisting.rowCount && txExisting.rowCount > 0) {
      const booking = txExisting.rows[0];
      const ticketsRes = await client.query<TicketRow>('SELECT * FROM tickets WHERE booking_id = $1;', [
        booking.id,
      ]);
      return { booking, tickets: ticketsRes.rows, bookedSeatRows: [], typeNameMap: new Map() };
    }

    const { totalAmount, bookedSeatRows, ticketItems, typeNameMap } = await prepareConfirmItems(
      client,
      hold,
      input
    );

    const bookingRes = await client.query<BookingRow>(
      `INSERT INTO bookings (user_id, session_id, hold_id, status, total_amount, reference)
       VALUES ($1, $2, $3, 'CONFIRMED', $4, $5)
       RETURNING *;`,
      [input.userId, hold.session_id, input.holdId, totalAmount, generateReference()]
    );
    const booking = bookingRes.rows[0];

    const tickets: TicketRow[] = [];
    for (const item of ticketItems) {
      const ticketId = crypto.randomUUID();
      const signedCode = signTicketCode(ticketId);
      const ticketRes = await client.query<TicketRow>(
        `INSERT INTO tickets (id, booking_id, ticket_type_id, event_seat_id, attendee_name, code, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
         RETURNING *;`,
        [ticketId, booking.id, item.ticketTypeId, item.seatId, item.attendeeName, signedCode]
      );
      tickets.push(ticketRes.rows[0]);
    }

    await client.query(`UPDATE waitlist_entries SET status = 'CONVERTED' WHERE offer_hold_id = $1;`, [
      input.holdId,
    ]);

    return { booking, tickets, bookedSeatRows, typeNameMap };
  });
}

/** Confirm a hold atomically, issue signed tickets, broadcast seat locks, and dispatch email. */
export async function confirmHold(input: ConfirmHoldInput): Promise<ConfirmHoldResult> {
  if (input.simulateFailure) {
    throw new DomainHttpError(402, 'PAYMENT_FAILED', 'Simulated payment processing error');
  }

  const holdRes = await query<HoldWithEventRow>(
    `SELECT h.*, s.event_id, s.starts_at, e.title as event_title, e.seating_mode,
            e.venue_name, e.cancel_deadline_hours, e.refund_percent
     FROM holds h
     JOIN sessions s ON h.session_id = s.id
     JOIN events e ON s.event_id = e.id
     WHERE h.id = $1 AND h.user_id = $2;`,
    [input.holdId, input.userId]
  );

  if (!holdRes.rowCount || holdRes.rowCount === 0) {
    throw new DomainHttpError(404, 'HOLD_NOT_FOUND', 'Hold not found or unauthorized');
  }

  const hold = holdRes.rows[0];
  if (new Date(hold.expires_at) < new Date()) {
    throw new DomainHttpError(
      410,
      'HOLD_EXPIRED',
      'Your hold has expired. The seats have been released back to inventory.'
    );
  }

  const existingBooking = await query<BookingRow>('SELECT * FROM bookings WHERE hold_id = $1', [
    input.holdId,
  ]);
  if (existingBooking.rowCount && existingBooking.rowCount > 0) {
    const booking = existingBooking.rows[0];
    const ticketsRes = await query<TicketRow>('SELECT * FROM tickets WHERE booking_id = $1', [booking.id]);
    return { alreadyConfirmed: true, booking, tickets: await attachQrCodes(ticketsRes.rows) };
  }

  let result: ConfirmTxResult;
  try {
    result = await runConfirmTransaction(hold, input);
  } catch (error: unknown) {
    const pgErr = error as { code?: string; constraint?: string };
    if (pgErr.code === '23505' && pgErr.constraint === 'uniq_active_ticket_per_seat') {
      console.error('[CRITICAL INTEGRITY RESCUE] uniq_active_ticket_per_seat triggered!', error);
      throw new DomainHttpError(
        409,
        'SEAT_ALREADY_BOOKED',
        'Database integrity constraint prevented double booking. Seat has already been booked.',
        undefined,
        error
      );
    }
    throw error;
  }

  if (result.bookedSeatRows.length > 0) {
    realtimeHub.broadcast(hold.session_id, 'seat_booked', {
      seatIds: result.bookedSeatRows.map((s) => s.id),
      bookingReference: result.booking.reference,
    });
  }

  const ticketsWithQr = await attachQrCodes(result.tickets);
  const seatById = new Map(result.bookedSeatRows.map((s) => [s.id, s]));
  const startsAt = typeof hold.starts_at === 'string' ? hold.starts_at : hold.starts_at.toISOString();

  sendBookingConfirmationEmail(
    input.userEmail,
    {
      title: hold.event_title,
      venue_name: hold.venue_name || 'Main Auditorium',
      starts_at: startsAt,
      cancel_deadline_hours: hold.cancel_deadline_hours,
      refund_percent: hold.refund_percent,
    },
    { reference: result.booking.reference, total_amount: Number(result.booking.total_amount) },
    ticketsWithQr.map((t) => {
      const seat = t.event_seat_id ? seatById.get(t.event_seat_id) : undefined;
      return {
        id: t.id,
        code: t.code,
        attendeeName: t.attendee_name,
        ticketTypeName: result.typeNameMap.get(t.ticket_type_id) ?? 'Ticket',
        section: seat?.section,
        rowLabel: seat?.row_label,
        seatNumber: seat?.seat_number,
      };
    })
  ).catch((e) => console.error('[Email Dispatch Warning]', e));

  return { alreadyConfirmed: false, booking: result.booking, tickets: ticketsWithQr };
}
