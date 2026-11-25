import type { HoldStrategy, SeatingMode } from './domain.js';

export interface SessionWithEventRow {
  id: string;
  event_id: string;
  starts_at: string | Date;
  ends_at: string | Date;
  sales_open_at: string | Date | null;
  sales_close_at: string | Date | null;
  event_title: string;
  seating_mode: SeatingMode;
  max_tickets_per_user: number;
}

export interface SeatLayoutRow {
  id: string;
  section: string;
  row_label: string;
  seat_number: number;
  x: number;
  y: number;
  status: string;
  hold_id: string | null;
  hold_expires_at: string | Date | null;
  version: number;
  ticket_type_id: string;
  tier_name: string;
  price: string | number;
  color: string;
  hold_user_id: string | null;
}

export interface FormattedSeatView {
  id: string;
  section: string;
  rowLabel: string;
  seatNumber: number;
  x: number;
  y: number;
  status: string;
  tierName: string;
  price: number;
  color: string;
  ticketTypeId: string;
  isHeldByMe: boolean;
  holdExpiresAt: string | Date | null | undefined;
}

export interface TicketTypeRow {
  id: string;
  name: string;
  price: string | number;
  capacity: number;
  reserved: number;
  color: string;
}

export interface SessionSeatsResult {
  session: SessionWithEventRow;
  seats: FormattedSeatView[];
  ticketTypes: TicketTypeRow[];
  serverTime: string;
}

export interface CreateHoldInput {
  sessionId: string;
  userId: string;
  seatIds?: string[];
  ticketTypeId?: string;
  quantity: number;
  strategy?: HoldStrategy;
}

export type CreateHoldResult =
  | {
      holdId: string;
      expiresAt: string;
      serverNow: string;
      quantity: number;
      ticketTypeId: string;
    }
  | {
      holdId: string;
      expiresAt: string;
      serverNow: string;
      seatIds: string[];
      strategy: HoldStrategy;
    };

export interface HoldSessionLimitRow {
  id: string;
  max_tickets_per_user: number;
  seating_mode: SeatingMode;
}

export interface SeatLockRow {
  id: string;
  status: string;
  hold_id: string | null;
  hold_expires_at: string | Date | null;
}
