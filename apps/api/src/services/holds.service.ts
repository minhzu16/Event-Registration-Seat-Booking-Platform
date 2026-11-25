import { config } from '../config.js';
import { query, withTransaction } from '../database.js';
import { DomainHttpError } from '../errors.js';
import type { HoldStrategy } from '../types/domain.js';
import type {
  CreateHoldInput,
  CreateHoldResult,
  FormattedSeatView,
  HoldSessionLimitRow,
  SeatLayoutRow,
  SessionSeatsResult,
  SessionWithEventRow,
  TicketTypeRow,
} from '../types/holds.types.js';
import { findBestAdjacentSeats, type AdjacentSeatsResult } from './adjacent-seats.js';
import {
  holdSeatsConditional,
  holdSeatsNaive,
  holdSeatsPessimistic,
} from './hold-strategies.service.js';
import { realtimeHub } from './realtime.js';
import { triggerWaitlistOffer } from './worker.js';

/** Fetch session info, live seat layout (with lazy hold expiry), and GA ticket types. */
export async function getSessionSeats(
  sessionId: string,
  currentUserId?: string
): Promise<SessionSeatsResult> {
  const sessionRes = await query<SessionWithEventRow>(
    `SELECT s.*, e.title as event_title, e.seating_mode, e.max_tickets_per_user
     FROM sessions s
     JOIN events e ON s.event_id = e.id
     WHERE s.id = $1;`,
    [sessionId]
  );

  if (!sessionRes.rowCount || sessionRes.rowCount === 0) {
    throw new DomainHttpError(404, 'SESSION_NOT_FOUND');
  }

  const seatsRes = await query<SeatLayoutRow>(
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
  const seats: FormattedSeatView[] = seatsRes.rows.map((seat) => {
    let liveStatus = seat.status;
    if (seat.status === 'HELD' && seat.hold_expires_at && new Date(seat.hold_expires_at) < now) {
      liveStatus = 'AVAILABLE';
    }
    const isHeldByMe = Boolean(currentUserId && seat.hold_user_id === currentUserId && liveStatus === 'HELD');

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
      isHeldByMe,
      holdExpiresAt: isHeldByMe ? seat.hold_expires_at : undefined,
    };
  });

  const ticketTypesRes = await query<TicketTypeRow>(
    `SELECT id, name, price, capacity, reserved, color
     FROM ticket_types
     WHERE session_id = $1
     ORDER BY price DESC;`,
    [sessionId]
  );

  return {
    session: sessionRes.rows[0],
    seats,
    ticketTypes: ticketTypesRes.rows,
    serverTime: new Date().toISOString(),
  };
}

/** Find optimal contiguous seats in a session or throw 404 when none are available. */
export async function suggestAdjacentSeats(
  sessionId: string,
  quantity: number,
  tierId?: string
): Promise<AdjacentSeatsResult> {
  const suggestion = await findBestAdjacentSeats(sessionId, quantity, tierId);
  if (!suggestion) {
    throw new DomainHttpError(
      404,
      'NO_ADJACENT_SEATS_FOUND',
      `Could not find ${quantity} contiguous seats together. Please select individual seats or try a smaller group.`
    );
  }
  return suggestion;
}

async function createGaHold(
  sessionId: string,
  userId: string,
  ticketTypeId: string | undefined,
  quantity: number,
  expiresAt: Date
): Promise<CreateHoldResult> {
  if (!ticketTypeId) {
    throw new DomainHttpError(400, 'MISSING_TICKET_TYPE', 'ticketTypeId is required for GA hold');
  }

  const gaResult = await withTransaction(async (client) => {
    const updateRes = await client.query<TicketTypeRow>(
      `UPDATE ticket_types
       SET reserved = reserved + $1
       WHERE id = $2 AND session_id = $3 AND (reserved + $1 <= capacity)
       RETURNING id, name, price, capacity, reserved;`,
      [quantity, ticketTypeId, sessionId]
    );
    if (updateRes.rowCount === 0) {
      return null;
    }

    const holdRes = await client.query<{ id: string }>(
      `INSERT INTO holds (user_id, session_id, expires_at) VALUES ($1, $2, $3) RETURNING id;`,
      [userId, sessionId, expiresAt]
    );
    return { holdId: holdRes.rows[0].id, ticketType: updateRes.rows[0] };
  });

  if (!gaResult) {
    throw new DomainHttpError(
      409,
      'CAPACITY_FULL',
      'Requested quantity exceeds available capacity. Please join the waitlist.'
    );
  }

  realtimeHub.broadcast(sessionId, 'capacity_updated', {
    ticketTypeId,
    reserved: gaResult.ticketType.reserved,
    capacity: gaResult.ticketType.capacity,
  });

  return {
    holdId: gaResult.holdId,
    expiresAt: expiresAt.toISOString(),
    serverNow: new Date().toISOString(),
    quantity,
    ticketTypeId,
  };
}

/** Create a temporary GA capacity or reserved-seat hold enforcing per-user ticket limits. */
export async function createHold(input: CreateHoldInput): Promise<CreateHoldResult> {
  const strategy: HoldStrategy = input.strategy || config.BOOKING_STRATEGY;

  const sessionRes = await query<HoldSessionLimitRow>(
    `SELECT s.*, e.max_tickets_per_user, e.seating_mode
     FROM sessions s
     JOIN events e ON s.event_id = e.id
     WHERE s.id = $1;`,
    [input.sessionId]
  );
  if (!sessionRes.rowCount || sessionRes.rowCount === 0) {
    throw new DomainHttpError(404, 'SESSION_NOT_FOUND');
  }
  const session = sessionRes.rows[0];

  const existingCountRes = await query<{ total_reserved: string | number }>(
    `SELECT (
       SELECT count(*) FROM tickets t
       JOIN bookings b ON t.booking_id = b.id
       WHERE b.user_id = $1 AND b.session_id = $2 AND t.status = 'ACTIVE'
     ) + (
       SELECT count(*) FROM event_seats es
       JOIN holds h ON es.hold_id = h.id
       WHERE h.user_id = $1 AND h.session_id = $2 AND h.expires_at > now()
     ) as total_reserved;`,
    [input.userId, input.sessionId]
  );

  const currentHeldCount = Number(existingCountRes.rows[0]?.total_reserved || 0);
  const requestedCount = input.seatIds ? input.seatIds.length : input.quantity;
  if (currentHeldCount + requestedCount > session.max_tickets_per_user) {
    throw new DomainHttpError(
      422,
      'LIMIT_EXCEEDED',
      `You cannot reserve more than ${session.max_tickets_per_user} tickets for this event. (Currently held/booked: ${currentHeldCount})`
    );
  }

  const expiresAt = new Date(Date.now() + config.DEFAULT_HOLD_MINUTES * 60 * 1000);
  if (session.seating_mode === 'GA' || (!input.seatIds && input.ticketTypeId)) {
    return createGaHold(input.sessionId, input.userId, input.ticketTypeId, input.quantity, expiresAt);
  }

  const seatIds = input.seatIds;
  if (!seatIds || seatIds.length === 0) {
    throw new DomainHttpError(400, 'NO_SEATS_SELECTED', 'seatIds array cannot be empty');
  }

  const strategyHandlers: Record<
    HoldStrategy,
    (sessionId: string, userId: string, seatIds: string[], expiresAt: Date) => Promise<string>
  > = {
    pessimistic: holdSeatsPessimistic,
    conditional: holdSeatsConditional,
    naive: holdSeatsNaive,
  };

  const holdId = await strategyHandlers[strategy](input.sessionId, input.userId, seatIds, expiresAt);

  realtimeHub.broadcast(input.sessionId, 'seat_held', {
    seatIds,
    holdId,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    holdId,
    expiresAt: expiresAt.toISOString(),
    serverNow: new Date().toISOString(),
    seatIds,
    strategy,
  };
}

/** Manually release an active hold owned by the user and notify waitlist subscribers. */
export async function releaseHold(
  holdId: string,
  userId: string
): Promise<{ message: string; releasedSeats: string[] }> {
  const holdRes = await query<{ id: string; session_id: string }>(
    'SELECT * FROM holds WHERE id = $1 AND user_id = $2',
    [holdId, userId]
  );
  if (holdRes.rowCount === 0) {
    throw new DomainHttpError(404, 'HOLD_NOT_FOUND');
  }
  const hold = holdRes.rows[0];

  const seatsRes = await query<{ id: string }>(
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

  return { message: 'Hold released successfully', releasedSeats: releasedIds };
}
