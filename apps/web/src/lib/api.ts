export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'ATTENDEE' | 'ORGANISER' | 'STAFF' | 'ADMIN';
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  capacity: number;
  reserved: number;
  color: string;
}

export interface Session {
  id: string;
  starts_at: string;
  ends_at: string;
  sales_open_at?: string;
  sales_close_at?: string;
  ticket_types?: TicketType[];
}

export interface Event {
  id: string;
  organiser_id: string;
  organiser_name?: string;
  title: string;
  description?: string;
  category: string;
  banner_url?: string;
  venue_name: string;
  seating_mode: 'GA' | 'RESERVED';
  status: string;
  cancel_deadline_hours: number;
  refund_percent: number;
  max_tickets_per_user: number;
  version: number;
  sessions?: Session[];
}

export interface Seat {
  id: string;
  section: string;
  rowLabel: string;
  seatNumber: number;
  x: number;
  y: number;
  status: 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED';
  tierName: string;
  price: number;
  color: string;
  ticketTypeId: string;
  isHeldByMe?: boolean;
  holdExpiresAt?: string;
}

export interface Ticket {
  id: string;
  code: string;
  status: string;
  attendeeName: string;
  checkedInAt?: string;
  ticketTypeName: string;
  price: number;
  seatSection?: string;
  seatRow?: string;
  seatNumber?: number;
  qrDataUrl?: string;
}

export interface Booking {
  id: string;
  reference: string;
  status: string;
  total_amount: number;
  created_at: string;
  event_title: string;
  venue_name: string;
  starts_at: string;
  ends_at: string;
  cancel_deadline_hours: number;
  refund_percent: number;
  tickets?: Ticket[];
}

// Token helper
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function setAuth(token: string, user: User) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `HTTP ${response.status}`;
    const err = new Error(errorMsg) as any;
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}
