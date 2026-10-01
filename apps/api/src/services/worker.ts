import { query, withTransaction } from '../database.js';
import { realtimeHub } from './realtime.js';

let workerInterval: NodeJS.Timeout | null = null;

export async function processExpiredHolds(): Promise<number> {
  try {
    const res = await query<{ id: string; session_id: string }>(
      `UPDATE event_seats
       SET status = 'AVAILABLE', hold_id = NULL, hold_expires_at = NULL, version = version + 1
       WHERE status = 'HELD' AND hold_expires_at < now()
       RETURNING id, session_id;`
    );

    if (res.rowCount && res.rowCount > 0) {
      console.log(`[Worker] Auto-released ${res.rowCount} expired seats.`);
      
      // Group by session to broadcast
      const bySession = new Map<string, string[]>();
      for (const row of res.rows) {
        const list = bySession.get(row.session_id) || [];
        list.push(row.id);
        bySession.set(row.session_id, list);
      }

      for (const [sessionId, seatIds] of bySession.entries()) {
        realtimeHub.broadcast(sessionId, 'seat_released', {
          seatIds,
          reason: 'EXPIRED',
          timestamp: Date.now(),
        });

        // Trigger waitlist check for this session
        await triggerWaitlistOffer(sessionId);
      }
    }

    // Also mark associated expired bookings
    await query(
      `UPDATE bookings
       SET status = 'EXPIRED'
       FROM holds
       WHERE bookings.hold_id = holds.id
         AND bookings.status = 'PENDING'
         AND holds.expires_at < now();`
    );

    return res.rowCount || 0;
  } catch (error) {
    console.error('[Worker] Error processing expired holds', error);
    return 0;
  }
}

export async function triggerWaitlistOffer(sessionId: string): Promise<void> {
  try {
    await withTransaction(async (client) => {
      // Find top waiting entry with SKIP LOCKED
      const entryRes = await client.query(
        `SELECT id, user_id, ticket_type_id, quantity
         FROM waitlist_entries
         WHERE session_id = $1 AND status = 'WAITING'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED;`,
        [sessionId]
      );

      if (entryRes.rowCount === 0) return;
      const entry = entryRes.rows[0];

      // Check if an available seat exists for this session
      const seatRes = await client.query(
        `SELECT id
         FROM event_seats
         WHERE session_id = $1 AND status = 'AVAILABLE'
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED;`,
        [sessionId]
      );

      if (seatRes.rowCount && seatRes.rowCount > 0) {
        const seatId = seatRes.rows[0].id;
        const offerExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h offer

        // Create exclusive hold for waitlisted user
        const holdRes = await client.query(
          `INSERT INTO holds (user_id, session_id, expires_at)
           VALUES ($1, $2, $3)
           RETURNING id;`,
          [entry.user_id, sessionId, offerExpiry]
        );
        const holdId = holdRes.rows[0].id;

        await client.query(
          `UPDATE event_seats
           SET status = 'HELD', hold_id = $1, hold_expires_at = $2, version = version + 1
           WHERE id = $3;`,
          [holdId, offerExpiry, seatId]
        );

        await client.query(
          `UPDATE waitlist_entries
           SET status = 'OFFERED', offer_hold_id = $1, offer_expires_at = $2
           WHERE id = $3;`,
          [holdId, offerExpiry, entry.id]
        );

        console.log(`[Waitlist] Created offer hold ${holdId} for user ${entry.user_id} on seat ${seatId}`);
        realtimeHub.broadcast(sessionId, 'seat_held', {
          seatIds: [seatId],
          holdId,
          expiresAt: offerExpiry.toISOString(),
        });
      }
    });
  } catch (error) {
    console.error('[Waitlist] Error allocating waitlist offer', error);
  }
}

export function startBackgroundWorker(intervalMs: number = 10000): void {
  if (workerInterval) return;
  console.log(`[Worker] Started background cleaner (every ${intervalMs / 1000}s)`);
  workerInterval = setInterval(async () => {
    await processExpiredHolds();
  }, intervalMs);
}

export function stopBackgroundWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[Worker] Stopped background cleaner');
  }
}
