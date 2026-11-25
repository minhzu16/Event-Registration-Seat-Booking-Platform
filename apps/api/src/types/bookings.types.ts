export type PaymentMethod = 'mock_card' | 'free' | 'momo' | 'vnpay';

export interface ConfirmHoldInput {
  holdId: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  paymentMethod: PaymentMethod;
  simulateFailure?: boolean;
  attendeeNames?: Record<string, string>;
}

export interface BookingRow {
  id: string;
  user_id: string;
  session_id: string;
  hold_id: string | null;
  status: string;
  total_amount: string | number;
  reference: string;
  created_at: string | Date;
  cancelled_at: string | Date | null;
}

export interface TicketRow {
  id: string;
  booking_id: string;
  ticket_type_id: string;
  event_seat_id: string | null;
  attendee_name: string;
  code: string;
  status: string;
  checked_in_at: string | Date | null;
}

export interface TicketWithQr extends TicketRow {
  qrDataUrl: string;
}

export interface ConfirmHoldResult {
  alreadyConfirmed: boolean;
  booking: BookingRow;
  tickets: TicketWithQr[];
}

export interface HoldWithEventRow {
  id: string;
  user_id: string;
  session_id: string;
  expires_at: string | Date;
  event_id: string;
  starts_at: string | Date;
  event_title: string;
  seating_mode: 'RESERVED' | 'GA';
  venue_name: string | null;
  cancel_deadline_hours: number;
  refund_percent: number;
}

export interface BookedSeatRow {
  id: string;
  ticket_type_id: string;
  section: string;
  row_label: string;
  seat_number: number;
}

export interface TicketTypePriceRow {
  id: string;
  name: string;
  price: string | number;
}

export interface TicketIssueItem {
  ticketTypeId: string;
  seatId: string | null;
  attendeeName: string;
}

export interface BookingTicketSummary {
  id: string;
  code: string;
  status: string;
  attendeeName: string;
  checkedInAt: string | Date | null;
  ticketTypeName: string;
  price: number;
  seatSection: string | null;
  seatRow: string | null;
  seatNumber: number | null;
}

export interface UserBookingRow extends BookingRow {
  event_title: string;
  category: string;
  venue_name: string;
  cancel_deadline_hours: number;
  refund_percent: number;
  starts_at: string | Date;
  ends_at: string | Date;
  tickets: BookingTicketSummary[] | null;
}

export interface UserBookingView extends Omit<UserBookingRow, 'tickets'> {
  tickets: Array<BookingTicketSummary & { qrDataUrl: string }>;
}

export interface CancelBookingRow extends BookingRow {
  starts_at: string | Date;
  cancel_deadline_hours: number;
  refund_percent: number;
  seating_mode: 'RESERVED' | 'GA';
}

export interface RollingPassTicketRow {
  id: string;
  code: string;
  status: string;
  checked_in_at: string | Date | null;
  user_id: string;
  attendee_name: string;
  tier_name: string;
}

export interface RollingPassResult {
  ticketId: string;
  status: string;
  checkedInAt: string | Date | null;
  attendeeName: string;
  tierName: string;
  rollingCode: string;
  qrDataUrl: string;
  expiresAt: number;
  remainingSeconds: number;
  windowSeconds: number;
}

export interface PaymentWebhookInput {
  eventId: string;
  holdId: string;
  transactionId: string;
  amount: number;
  status: 'SUCCEEDED' | 'FAILED';
  signature?: string;
}

export type WebhookResult =
  | { received: true; status: 'ALREADY_PROCESSED' }
  | { received: true; action: 'RELEASED' }
  | { received: true; action: 'CONFIRMED'; transactionId: string };
