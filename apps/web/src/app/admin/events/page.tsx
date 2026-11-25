'use client';

import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, RefreshCw, Calendar, CheckCircle2, XCircle, Clock, FileEdit } from 'lucide-react';
import { getAdminEvents, updateAdminEventStatus, AdminEvent } from '@/lib/admin-api';
import { Pagination } from '@/components/admin/Pagination';

const STATUS_OPTIONS = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'ENDED'];

const statusChipStyles: Record<string, string> = {
  PUBLISHED: 'chip-success',
  DRAFT: 'chip-warning',
  CANCELLED: 'chip-danger',
  ENDED: 'chip-neutral',
};

export default function AdminEventsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [actionError, setActionError] = useState<{ eventId: string; message: string } | null>(null);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);

  // Debounce search input by 300 ms; only start loading when the effective search really changes.
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

  // Fetch events when filters or page change
  useEffect(() => {
    let ignore = false;

    getAdminEvents({
      search: debouncedSearch,
      status: statusFilter,
      page,
      pageSize,
    })
      .then((data) => {
        if (!ignore) {
          setEvents(data.items || []);
          setTotal(data.total || 0);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err?.message || 'Failed to load events.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [debouncedSearch, statusFilter, page, reloadTrigger]);

  function handleStatusFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(e.target.value);
    setPage(1);
    setLoading(true);
  }

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadTrigger((prev) => prev + 1);
  }

  async function handleStatusChange(eventItem: AdminEvent, newStatus: string) {
    if (eventItem.status === newStatus) return;

    // Destructive actions require window.confirm
    if (newStatus === 'CANCELLED') {
      const confirmed = window.confirm(
        `Are you sure you want to cancel "${eventItem.title}"? This is a destructive action.`
      );
      if (!confirmed) return;
    } else if (newStatus === 'ENDED') {
      const confirmed = window.confirm(
        `Are you sure you want to end "${eventItem.title}"? Ticket sales and session check-ins will close.`
      );
      if (!confirmed) return;
    }

    const previousStatus = eventItem.status;
    setActionError(null);
    setUpdatingEventId(eventItem.id);

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) => (e.id === eventItem.id ? { ...e, status: newStatus } : e))
    );

    try {
      await updateAdminEventStatus(eventItem.id, newStatus);
    } catch (err: unknown) {
      // Rollback on failure
      setEvents((prev) =>
        prev.map((e) => (e.id === eventItem.id ? { ...e, status: previousStatus } : e))
      );
      const errMsg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Failed to update event status.';
      setActionError({ eventId: eventItem.id, message: errMsg });
    } finally {
      setUpdatingEventId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter toolbar */}
      <div className="glass-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="event-search" className="sr-only">
              Search events by title or organiser
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="event-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search events by title or organiser…"
              className="input w-full pl-9 pr-3 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Status:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="input text-xs py-1.5"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
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
            <p className="text-xs text-slate-500 font-medium">Loading events…</p>
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
        ) : events.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Calendar className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-700">No events found</h3>
            <p className="text-xs text-slate-500">
              {searchInput || statusFilter
                ? 'Try adjusting your search criteria or clearing filters.'
                : 'No events registered in the system yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-glass" aria-label="Events list">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Organiser</th>
                  <th scope="col">Category</th>
                  <th scope="col">Mode</th>
                  <th scope="col" className="numeric">Sessions</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((eventItem) => {
                  const isUpdating = updatingEventId === eventItem.id;
                  const hasError = actionError?.eventId === eventItem.id;
                  const status = eventItem.status;
                  const chipClass = statusChipStyles[status] || 'chip-neutral';

                  return (
                    <tr key={eventItem.id} className="transition-colors">
                      <td className="font-semibold text-slate-900 max-w-xs">
                        <div className="truncate" title={eventItem.title}>
                          {eventItem.title}
                        </div>
                        {eventItem.venueName && (
                          <div className="text-[11px] text-slate-500 font-normal truncate">
                            {eventItem.venueName}
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-slate-600">
                        {eventItem.organiserName || '—'}
                      </td>
                      <td className="text-xs text-slate-600">
                        <span className="chip chip-neutral text-[11px]">
                          {eventItem.category || 'General'}
                        </span>
                      </td>
                      <td className="text-xs text-slate-600">
                        <span className="font-medium text-[11px] uppercase tracking-wide">
                          {eventItem.seatingMode || 'GA'}
                        </span>
                      </td>
                      <td className="numeric text-xs font-semibold tabular-nums text-slate-700">
                        {eventItem.sessionCount ?? 0}
                      </td>
                      <td>
                        <span className={`chip ${chipClass}`}>{status}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Buttons depending on current status */}
                          {status === 'DRAFT' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleStatusChange(eventItem, 'PUBLISHED')}
                              className="btn btn-primary py-1 px-2.5 text-xs font-medium"
                              aria-label={`Publish ${eventItem.title}`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Publish</span>
                            </button>
                          )}

                          {status === 'PUBLISHED' && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(eventItem, 'DRAFT')}
                                className="btn btn-secondary py-1 px-2.5 text-xs font-medium"
                                aria-label={`Move ${eventItem.title} to draft`}
                              >
                                <FileEdit className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Draft</span>
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(eventItem, 'ENDED')}
                                className="btn btn-secondary py-1 px-2.5 text-xs font-medium"
                                aria-label={`End ${eventItem.title}`}
                              >
                                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>End</span>
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(eventItem, 'CANCELLED')}
                                className="btn btn-danger py-1 px-2.5 text-xs font-medium"
                                aria-label={`Cancel ${eventItem.title}`}
                              >
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}

                          {(status === 'CANCELLED' || status === 'ENDED') && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleStatusChange(eventItem, 'DRAFT')}
                              className="btn btn-secondary py-1 px-2.5 text-xs font-medium"
                              aria-label={`Move ${eventItem.title} to draft`}
                            >
                              <FileEdit className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Move to draft</span>
                            </button>
                          )}
                        </div>

                        {hasError && (
                          <p role="alert" className="mt-1 text-[11px] text-rose-600 font-medium">
                            {actionError.message}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {!loading && !error && events.length > 0 && (
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
