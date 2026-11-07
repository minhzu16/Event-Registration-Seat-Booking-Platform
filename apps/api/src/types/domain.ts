/**
 * Unified Domain Models & Strict Discriminated Unions for SeatLock Platform.
 * Follows Matt Pocock (TypeScript Domain Modeling) & Karpathy Guidelines (Type Safety without loose any).
 */

export type UserRole = 'ADMIN' | 'ORGANISER' | 'STAFF' | 'ATTENDEE';

export type SeatingMode = 'RESERVED' | 'GA';

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED';

export type HoldStrategy = 'pessimistic' | 'conditional' | 'naive';

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';

export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export interface EventDetail {
  id: string;
  organiserId: string;
  title: string;
  description: string;
  category: string;
  bannerUrl: string;
  venueName: string;
  seatingMode: SeatingMode;
  status: EventStatus;
  version: number;
  cancelDeadlineHours: number;
  refundPercent: number;
  maxTicketsPerUser: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail {
  id: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  salesOpenAt: string;
  salesCloseAt: string;
}

export interface TicketTypeDetail {
  id: string;
  sessionId: string;
  name: string;
  price: number;
  capacity: number;
  reserved: number;
  color: string;
}

export interface SeatDetail {
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

export interface SeatHoldResult {
  holdId: string;
  expiresAt: string;
  serverNow: string;
  seatIds?: string[];
  strategy?: HoldStrategy;
  quantity?: number;
  ticketTypeId?: string;
}

export interface BookingDetail {
  id: string;
  reference: string;
  userId: string;
  sessionId: string;
  holdId?: string;
  status: BookingStatus;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
  tickets?: TicketDetail[];
}

export interface TicketDetail {
  id: string;
  bookingId: string;
  eventSeatId?: string;
  ticketTypeId?: string;
  status: TicketStatus;
  code: string;
  attendeeName?: string;
  checkedInAt?: string | null;
  qrDataUrl?: string;
}

export interface IntegrityCheckReport {
  sessionId: string;
  checkedAt: string;
  status: 'PASSED' | 'FAILED';
  totalViolations: number;
  doubleBookings: Array<{
    seatId: string;
    section: string;
    row: string;
    number: number;
    activeTicketsCount: number;
  }>;
  inconsistentSeats: Array<{
    seatId: string;
    seatStatus: string;
    section: string;
    row: string;
    number: number;
  }>;
  capacityViolations: Array<{
    ticketTypeId: string;
    name: string;
    capacity: number;
    reserved: number;
  }>;
}

