import { fetchApi } from './api';

export type UserRole = 'ATTENDEE' | 'ORGANISER' | 'STAFF' | 'ADMIN';

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ENDED' | string;

export interface AdminStats {
  users: {
    total: number;
    byRole: Record<string, number>;
  };
  events: {
    total: number;
    byStatus: Record<string, number>;
  };
  bookings: {
    confirmed: number;
    revenue30d: number;
  };
  tickets: {
    active: number;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  createdAt: string;
}

export interface AdminEvent {
  id: string;
  title: string;
  category: string;
  venueName: string;
  seatingMode: 'GA' | 'RESERVED' | string;
  status: EventStatus;
  organiserName?: string | null;
  createdAt: string;
  sessionCount: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserQueryParams {
  search?: string;
  role?: string;
  page?: number;
  pageSize?: number;
}

export interface EventQueryParams {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  return fetchApi<AdminStats>('/admin/stats');
}

export async function getAdminUsers(query: UserQueryParams = {}): Promise<Page<AdminUser>> {
  const params = new URLSearchParams();
  if (query.search && query.search.trim() !== '') {
    params.set('search', query.search.trim());
  }
  if (query.role && query.role.trim() !== '') {
    params.set('role', query.role.trim());
  }
  if (query.page !== undefined && query.page !== null) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined && query.pageSize !== null) {
    params.set('pageSize', String(query.pageSize));
  }

  const qs = params.toString();
  return fetchApi<Page<AdminUser>>(`/admin/users${qs ? `?${qs}` : ''}`);
}

export async function updateAdminUserRole(id: string, role: UserRole): Promise<AdminUser> {
  return fetchApi<AdminUser>(`/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function getAdminEvents(query: EventQueryParams = {}): Promise<Page<AdminEvent>> {
  const params = new URLSearchParams();
  if (query.search && query.search.trim() !== '') {
    params.set('search', query.search.trim());
  }
  if (query.status && query.status.trim() !== '') {
    params.set('status', query.status.trim());
  }
  if (query.page !== undefined && query.page !== null) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined && query.pageSize !== null) {
    params.set('pageSize', String(query.pageSize));
  }

  const qs = params.toString();
  return fetchApi<Page<AdminEvent>>(`/admin/events${qs ? `?${qs}` : ''}`);
}

export async function updateAdminEventStatus(
  id: string,
  status: string
): Promise<{ id: string; status: string; version: number }> {
  return fetchApi<{ id: string; status: string; version: number }>(
    `/admin/events/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}
