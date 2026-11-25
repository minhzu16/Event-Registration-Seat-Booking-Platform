import type pg from 'pg';
import { query, withTransaction } from '../database.js';
import { DomainHttpError } from '../errors.js';
import type { SeatLockRow } from '../types/holds.types.js';

async function insertHoldInTx(
  client: pg.PoolClient,
  userId: string,
  sessionId: string,
  expiresAt: Date
): Promise<string> {
  const holdRes = await client.query<{ id: string }>(
    `INSERT INTO holds (user_id, session_id, expires_at) VALUES ($1, $2, $3) RETURNING id;`,
    [userId, sessionId, expiresAt]
  );
  return holdRes.rows[0].id;
}

/** Pessimistic locking strategy (`SELECT ... FOR UPDATE ORDER BY id`) preventing deadlocks. */
export async function holdSeatsPessimistic(
  sessionId: string,
  userId: string,
  seatIds: string[],
  expiresAt: Date
): Promise<string> {
  return withTransaction(async (client) => {
    const lockRes = await client.query<SeatLockRow>(
      `SELECT id, status, hold_id, hold_expires_at
       FROM event_seats
       WHERE session_id = $1 AND id = ANY($2::uuid[])
       ORDER BY id ASC
       FOR UPDATE;`,
      [sessionId, seatIds]
    );

    if (lockRes.rowCount !== seatIds.length) {
      throw new DomainHttpError(
        409,
        'INVALID_SEAT_IDS',
        'One or more selected seats are no longer available.'
      );
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
      throw new DomainHttpError(
        409,
        'SEAT_UNAVAILABLE',
        'One or more selected seats are no longer available.',
        { unavailableSeats }
      );
    }

    const holdId = await insertHoldInTx(client, userId, sessionId, expiresAt);
    await client.query(
      `UPDATE event_seats
       SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
       WHERE id = ANY($3::uuid[]);`,
      [holdId, expiresAt, seatIds]
    );
    return holdId;
  });
}

/** Conditional Compare-And-Set update strategy rolling back atomically on partial seat conflict. */
export async function holdSeatsConditional(
  sessionId: string,
  userId: string,
  seatIds: string[],
  expiresAt: Date
): Promise<string> {
  return withTransaction(async (client) => {
    const holdId = await insertHoldInTx(client, userId, sessionId, expiresAt);

    const updateRes = await client.query<{ id: string }>(
      `UPDATE event_seats
       SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
       WHERE session_id = $3
         AND id = ANY($4::uuid[])
         AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < now()))
       RETURNING id;`,
      [holdId, expiresAt, sessionId, seatIds]
    );

    if (updateRes.rowCount !== seatIds.length) {
      throw new DomainHttpError(
        409,
        'SEAT_UNAVAILABLE',
        'One or more selected seats were seized by another attendee.',
        { strategy: 'conditional' }
      );
    }
    return holdId;
  });
}

/** Naive unlocked strategy intentionally exposing lost-update race conditions in concurrency demos. */
export async function holdSeatsNaive(
  sessionId: string,
  userId: string,
  seatIds: string[],
  expiresAt: Date
): Promise<string> {
  const checkRes = await query<{ id: string; status: string }>(
    `SELECT id, status FROM event_seats WHERE session_id = $1 AND id = ANY($2::uuid[])`,
    [sessionId, seatIds]
  );

  if (!checkRes.rows.every((s) => s.status === 'AVAILABLE')) {
    throw new DomainHttpError(409, 'SEAT_UNAVAILABLE', undefined, { strategy: 'naive' });
  }

  // Intentional delay to expose classic lost-update race condition in demo mode
  await new Promise((resolve) => setTimeout(resolve, 30));

  const holdRes = await query<{ id: string }>(
    `INSERT INTO holds (user_id, session_id, expires_at) VALUES ($1, $2, $3) RETURNING id;`,
    [userId, sessionId, expiresAt]
  );
  const holdId = holdRes.rows[0].id;

  await query(
    `UPDATE event_seats
     SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
     WHERE id = ANY($3::uuid[]);`,
    [holdId, expiresAt, seatIds]
  );
  return holdId;
}
