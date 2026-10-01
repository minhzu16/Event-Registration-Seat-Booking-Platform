import { query } from '../database.js';

export interface AdjacentSeatsResult {
  section: string;
  rowLabel: string;
  seatIds: string[];
  seatNumbers: number[];
  tierName: string;
  totalPrice: number;
}

/**
 * Sliding Window Algorithm to find the best N adjacent (contiguous) available seats in a single row.
 * Scored by proximity to row center (optimal stage viewing angle).
 */
export async function findBestAdjacentSeats(
  sessionId: string,
  quantity: number,
  ticketTypeId?: string
): Promise<AdjacentSeatsResult | null> {
  const now = new Date();

  let sql = `
    SELECT es.id, es.section, es.row_label, es.seat_number, es.x, es.y, es.status, es.hold_expires_at,
           tt.id as ticket_type_id, tt.name as tier_name, tt.price
    FROM event_seats es
    JOIN ticket_types tt ON es.ticket_type_id = tt.id
    WHERE es.session_id = $1
      AND (es.status = 'AVAILABLE' OR (es.status = 'HELD' AND es.hold_expires_at < $2))
  `;
  const params: any[] = [sessionId, now];

  if (ticketTypeId) {
    params.push(ticketTypeId);
    sql += ` AND es.ticket_type_id = $${params.length}`;
  }

  sql += ` ORDER BY es.section ASC, es.row_label ASC, es.seat_number ASC;`;

  const res = await query(sql, params);
  const seats = res.rows;

  if (seats.length < quantity) {
    return null;
  }

  // Group seats by "section:row"
  const rowGroups = new Map<string, typeof seats>();
  for (const s of seats) {
    const key = `${s.section}:${s.row_label}`;
    const list = rowGroups.get(key) || [];
    list.push(s);
    rowGroups.set(key, list);
  }

  let bestResult: AdjacentSeatsResult | null = null;
  let bestScore = Infinity; // Lower score = closer to center (better)

  for (const [, rowSeats] of rowGroups.entries()) {
    if (rowSeats.length < quantity) continue;

    // Sliding window of size `quantity`
    for (let i = 0; i <= rowSeats.length - quantity; i++) {
      let isContiguous = true;

      for (let k = 1; k < quantity; k++) {
        if (rowSeats[i + k].seat_number !== rowSeats[i + k - 1].seat_number + 1) {
          isContiguous = false;
          break;
        }
      }

      if (isContiguous) {
        const windowSeats = rowSeats.slice(i, i + quantity);
        // Center score: average distance from ideal center (seat 6 in standard 12-seat row)
        const avgSeatNum = windowSeats.reduce((sum, s) => sum + s.seat_number, 0) / quantity;
        const centerScore = Math.abs(avgSeatNum - 6.5);

        // Section preference bonus: VIP and Front rows get lower score
        const sectionBonus = windowSeats[0].section.includes('VIP') ? -10 : 0;
        const totalScore = centerScore + sectionBonus;

        if (totalScore < bestScore) {
          bestScore = totalScore;
          bestResult = {
            section: windowSeats[0].section,
            rowLabel: windowSeats[0].row_label,
            seatIds: windowSeats.map((s) => s.id),
            seatNumbers: windowSeats.map((s) => s.seat_number),
            tierName: windowSeats[0].tier_name,
            totalPrice: windowSeats.reduce((sum, s) => sum + Number(s.price), 0),
          };
        }
      }
    }
  }

  return bestResult;
}
