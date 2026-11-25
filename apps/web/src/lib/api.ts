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
  event_title?: string;
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

export interface EventSummary {
  id: string;
  title: string;
  category: string;
  venue_name: string;
  status: string;
  seating_mode: 'GA' | 'RESERVED';
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
  holdId?: string;
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

export interface AttendeeInfo {
  attendee_name: string;
  section?: string;
  row_label?: string;
  seat_number?: number;
  checked_in_at?: string;
}

export interface ScanResponse {
  result: string;
  message?: string;
  attendee?: AttendeeInfo;
}

export interface RecentScan {
  code: string;
  result: string;
  attendee?: AttendeeInfo;
  message?: string;
  timestamp: string;
}

export interface SampleTicket extends Ticket {
  eventTitle?: string;
}

export interface IssuedTicket {
  id: string;
  code: string;
  attendee_name: string;
  qrDataUrl?: string;
}

export interface BookingConfirmation {
  booking: Booking;
  tickets: IssuedTicket[];
}

export interface ApiErrorBody {
  message?: string;
  error?: string;
  result?: string;
  attendee?: AttendeeInfo;
  [key: string]: unknown;
}

export interface ApiError extends Error {
  status?: number;
  data?: ApiErrorBody;
}

export interface AttendanceReportSummary {
  totalTickets: number;
  checkedIn: number;
  noShows: number;
  cancelledTickets: number;
  fillRatePercent: number;
  totalRevenue: number;
}

export interface AttendanceTierBreakdown {
  name: string;
  price: number;
  color?: string;
  tickets_sold: string | number;
  checked_in: string | number;
}

export interface AttendanceReport {
  summary: AttendanceReportSummary;
  tierBreakdown?: AttendanceTierBreakdown[];
  timeSeries?: unknown[];
  waitlist?: unknown;
}

export interface SessionSeatMapResponse {
  session: Session;
  seats: Seat[];
  ticketTypes?: TicketType[];
  serverTime: string;
}

export interface BenchmarkLatency {
  avg: number;
  min: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
}

export interface BenchmarkResult {
  strategy: string;
  totalRequests: number;
  targetSeatsCount: number;
  actualHeldSeatsCount: number;
  successfulHolds: number;
  conflicts409: number;
  errors500: number;
  durationMs: number;
  throughputRps: number;
  latencyMs: BenchmarkLatency;
}

export interface IntegrityReport {
  status: 'PASSED' | 'VIOLATIONS_FOUND' | string;
  totalViolations: number;
  doubleBookings?: unknown[];
  inconsistentSeats?: unknown[];
  capacityViolations?: unknown[];
  timestamp?: string;
}

export interface SimulationSession extends Session {
  eventTitle?: string;
}

// Token helper - in-memory storage for XSS protection
let inMemoryToken: string | null = null;

export function getStoredToken(): string | null {
  return inMemoryToken;
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function setAuth(token: string, user: User) {
  inMemoryToken = token;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token'); // Never store sensitive access token in localStorage
    localStorage.setItem('user', JSON.stringify(user));
  }
}

export function clearAuth() {
  inMemoryToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAuthToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        clearAuth();
        return null;
      }
      const data = (await res.json()) as { token?: string; accessToken?: string; user?: User };
      const newToken = data.accessToken || data.token || null;
      if (newToken && data.user) {
        setAuth(newToken, data.user);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('auth-changed'));
        }
      }
      return newToken;
    } catch {
      clearAuth();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function initAuthSession(): Promise<User | null> {
  const token = await refreshAuthToken();
  if (token) {
    return getStoredUser();
  }
  return null;
}

export async function fetchApi<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    credentials: 'include',
    headers,
  });

  // Handle 401 automatic silent refresh and retry (except for auth endpoints)
  if (
    response.status === 401 &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/refresh') &&
    !endpoint.includes('/auth/register')
  ) {
    const refreshedToken = await refreshAuthToken();
    if (refreshedToken) {
      headers.set('Authorization', `Bearer ${refreshedToken}`);
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers,
      });
      const retryData = (await retryResponse.json().catch(() => null)) as ApiErrorBody | null;
      if (!retryResponse.ok) {
        const errorMsg = retryData?.message || retryData?.error || `HTTP ${retryResponse.status}`;
        const err = new Error(errorMsg) as ApiError;
        err.status = retryResponse.status;
        err.data = retryData ?? undefined;
        throw err;
      }
      return retryData as unknown as T;
    }
  }

  const data = (await response.json().catch(() => null)) as ApiErrorBody | null;

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `HTTP ${response.status}`;
    const err = new Error(errorMsg) as ApiError;
    err.status = response.status;
    err.data = data ?? undefined;
    throw err;
  }

  return data as unknown as T;
}
