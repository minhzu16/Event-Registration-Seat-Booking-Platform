/**
 * SeatLock Frontend Domain Types.
 * Directly mirrors backend domain contracts with strict typing.
 */

export type UserRole = 'ADMIN' | 'ORGANISER' | 'STAFF' | 'ATTENDEE';

export type SeatingMode = 'RESERVED' | 'GA';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED';

export type HoldStrategy = 'pessimistic' | 'conditional' | 'naive';

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';

export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
}

export interface Session {
  id: string;
  event_id?: string;
  starts_at?: string;
  ends_at?: string;
  sales_open_at?: string;
  sales_close_at?: string;
  event_title?: string;
  seating_mode?: SeatingMode;
  max_tickets_per_user?: number;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  category: string;
  banner_url: string;
  venue_name: string;
  seating_mode: SeatingMode;
  status: string;
  version: number;
  cancel_deadline_hours: number;
  refund_percent: number;
  max_tickets_per_user: number;
  organiser_name?: string;
  sessions?: Session[];
}

export interface Seat {
  id: string;
  section: string;
  rowLabel: string;
  seatNumber: number;
  x: number;
  y: number;
  status: SeatStatus;
  tierName: string;
  price: number;
  color: string;
  ticketTypeId: string;
  isHeldByMe?: boolean;
  holdExpiresAt?: string;
  holdId?: string;
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  capacity: number;
  reserved: number;
  color: string;
}

export interface Booking {
  id: string;
  reference: string;
  event_title: string;
  venue_name: string;
  starts_at: string;
  status: BookingStatus;
  total_amount: number;
  payment_method: string;
  created_at: string;
  cancel_deadline_hours: number;
  refund_percent: number;
  tickets?: Ticket[];
}

export interface Ticket {
  id: string;
  code: string;
  status: TicketStatus;
  checked_in_at: string | null;
  attendee_name: string | null;
  section?: string;
  row_label?: string;
  seat_number?: number;
  tier_name?: string;
  price?: number;
  qrDataUrl?: string;
}

