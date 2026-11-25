'use client';

import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, RefreshCw, UserCheck } from 'lucide-react';
import { getAdminUsers, updateAdminUserRole, AdminUser, UserRole } from '@/lib/admin-api';
import { useAdminUser } from '@/components/admin/AdminGuard';
import { Pagination } from '@/components/admin/Pagination';

const ROLES: UserRole[] = ['ATTENDEE', 'ORGANISER', 'STAFF', 'ADMIN'];

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAdminUser();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Per-user inline error message when role update fails
  const [roleError, setRoleError] = useState<{ userId: string; message: string } | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Debounce search input by 300 ms. Only start loading when the effective search really changes:
  // typing then deleting within the window must not leave the spinner on with no fetch to clear it.
  useEffect(() => {
    if (searchInput === debouncedSearch) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchInput, debouncedSearch]);

  // Fetch users when filters or page changes
  useEffect(() => {
    let ignore = false;

    getAdminUsers({
      search: debouncedSearch,
      role: roleFilter,
      page,
      pageSize,
    })
      .then((data) => {
        if (!ignore) {
          setUsers(data.items || []);
          setTotal(data.total || 0);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err?.message || 'Failed to load users.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [debouncedSearch, roleFilter, page, reloadTrigger]);

  function handleRoleFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setRoleFilter(e.target.value);
    setPage(1);
    setLoading(true);
  }

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadTrigger((prev) => prev + 1);
  }

  async function handleRoleChange(userToUpdate: AdminUser, newRole: UserRole) {
    if (userToUpdate.role === newRole) return;
    if (userToUpdate.id === currentAdmin?.id) return;

    const previousRole = userToUpdate.role;
    setRoleError(null);
    setUpdatingUserId(userToUpdate.id);

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === userToUpdate.id ? { ...u, role: newRole } : u))
    );

    try {
      await updateAdminUserRole(userToUpdate.id, newRole);
    } catch (err: unknown) {
      // Rollback on failure
      setUsers((prev) =>
        prev.map((u) => (u.id === userToUpdate.id ? { ...u, role: previousRole } : u))
      );
      const errMsg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to update user role.';
      setRoleError({ userId: userToUpdate.id, message: errMsg });
    } finally {
      setUpdatingUserId(null);
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter toolbar */}
      <div className="glass-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="user-search" className="sr-only">
              Search users by name or email
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="user-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search users by name or email…"
              className="input w-full pl-9 pr-3 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="role-filter" className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Role:
            </label>
            <select
              id="role-filter"
              value={roleFilter}
              onChange={handleRoleFilterChange}
              className="input text-xs py-1.5"
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table area */}
      <div className="glass overflow-hidden">
        {loading ? (
          <div className="p-8 text-center space-y-3" aria-busy="true">
            <div className="inline-block h-6 w-6 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading users…</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" aria-hidden="true" />
            <p className="text-xs text-rose-600 font-medium">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="btn btn-secondary inline-flex items-center gap-2 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <UserCheck className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-700">No users found</h3>
            <p className="text-xs text-slate-500">
              {searchInput || roleFilter
                ? 'Try adjusting your search criteria or clearing filters.'
                : 'No registered users in the database yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-glass" aria-label="Users list">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => {
                  const isCurrentAdmin = item.id === currentAdmin?.id;
                  const isUpdating = updatingUserId === item.id;
                  const hasError = roleError?.userId === item.id;

                  return (
                    <tr key={item.id} className="transition-colors">
                      <td className="font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{item.fullName || '—'}</span>
                          {isCurrentAdmin && (
                            <span className="chip chip-neutral text-[10px] py-0.5 px-1.5" title="You">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-slate-600 text-xs">{item.email}</td>
                      <td>
                        <div className="space-y-1">
                          <label htmlFor={`role-select-${item.id}`} className="sr-only">
                            Change role for {item.fullName || item.email}
                          </label>
                          <select
                            id={`role-select-${item.id}`}
                            value={item.role}
                            disabled={isCurrentAdmin || isUpdating}
                            title={isCurrentAdmin ? "You can't change your own role" : undefined}
                            onChange={(e) => handleRoleChange(item, e.target.value as UserRole)}
                            className="input py-1 px-2 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          {hasError && (
                            <p role="alert" className="text-[11px] text-rose-600 font-medium">
                              {roleError.message}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="text-xs text-slate-500 tabular-nums">
                        {formatDate(item.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {!loading && !error && users.length > 0 && (
          <div className="border-t border-slate-200/60 px-4">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(newPage) => {
                setPage(newPage);
                setLoading(true);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
