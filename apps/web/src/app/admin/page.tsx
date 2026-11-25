'use client';

import React, { useState, useEffect } from 'react';
import { Users, CalendarCheck, Ticket, DollarSign, RefreshCw, AlertCircle } from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { getAdminStats, AdminStats } from '@/lib/admin-api';

// Prices and booking totals are stored in VND across the app (see bookings/organiser pages).
const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const roleChipStyles: Record<string, string> = {
  ADMIN: 'chip-danger',
  ORGANISER: 'chip-info',
  STAFF: 'chip-warning',
  ATTENDEE: 'chip-neutral',
};

const statusChipStyles: Record<string, string> = {
  PUBLISHED: 'chip-success',
  DRAFT: 'chip-warning',
  CANCELLED: 'chip-danger',
  ENDED: 'chip-neutral',
};

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let ignore = false;

    getAdminStats()
      .then((data) => {
        if (!ignore) {
          setStats(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err?.message || 'Failed to load admin statistics.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [reloadTrigger]);

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadTrigger((prev) => prev + 1);
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading admin statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse space-y-3">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="h-8 w-20 rounded bg-slate-300" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse space-y-4">
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-8 rounded bg-slate-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="glass-card flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Failed to load statistics</h2>
          <p className="mt-1 text-xs text-slate-600 max-w-sm">{error || 'An unexpected error occurred.'}</p>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="btn btn-secondary inline-flex items-center gap-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const usersTotal = stats.users?.total ?? 0;
  const eventsPublished = stats.events?.byStatus?.['PUBLISHED'] ?? 0;
  const bookingsConfirmed = stats.bookings?.confirmed ?? 0;
  const revenue30d = stats.bookings?.revenue30d ?? 0;

  const usersByRole = Object.entries(stats.users?.byRole || {});
  const eventsByStatus = Object.entries(stats.events?.byStatus || {});

  return (
    <div className="space-y-6">
      {/* 4 StatCards */}
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="High-level statistics"
      >
        <StatCard
          label="Total Users"
          value={numberFormatter.format(usersTotal)}
          hint="All registered"
          tone="accent"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Published Events"
          value={numberFormatter.format(eventsPublished)}
          hint={`${stats.events?.total ?? 0} total`}
          tone="success"
          icon={<CalendarCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Confirmed Bookings"
          value={numberFormatter.format(bookingsConfirmed)}
          hint={`${stats.tickets?.active ?? 0} active tickets`}
          tone="info"
          icon={<Ticket className="h-5 w-5" />}
        />
        <StatCard
          label="30-Day Revenue"
          value={currencyFormatter.format(revenue30d)}
          hint="Last 30 days"
          tone="warning"
          icon={<DollarSign className="h-5 w-5" />}
        />
      </section>

      {/* Two glass cards listing users by role and events by status */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2" aria-label="Breakdown statistics">
        {/* Users by role */}
        <div className="glass-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Users by Role
            </h2>
            <span className="text-xs font-semibold text-slate-500">
              {numberFormatter.format(usersTotal)} total
            </span>
          </div>

          <div className="space-y-2.5">
            {usersByRole.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No user role data available.</p>
            ) : (
              usersByRole.map(([role, count]) => {
                const percentage = usersTotal > 0 ? Math.round((count / usersTotal) * 100) : 0;
                const chipClass = roleChipStyles[role] || 'chip-neutral';

                return (
                  <div
                    key={role}
                    className="flex items-center justify-between rounded-lg p-2.5 transition-colors hover:bg-white/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`chip ${chipClass}`}>{role}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-medium">{percentage}%</span>
                      <span className="text-sm font-bold tabular-nums text-slate-900">
                        {numberFormatter.format(count)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Events by status */}
        <div className="glass-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Events by Status
            </h2>
            <span className="text-xs font-semibold text-slate-500">
              {numberFormatter.format(stats.events?.total ?? 0)} total
            </span>
          </div>

          <div className="space-y-2.5">
            {eventsByStatus.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No event status data available.</p>
            ) : (
              eventsByStatus.map(([status, count]) => {
                const totalEvents = stats.events?.total ?? 0;
                const percentage = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
                const chipClass = statusChipStyles[status] || 'chip-neutral';

                return (
                  <div
                    key={status}
                    className="flex items-center justify-between rounded-lg p-2.5 transition-colors hover:bg-white/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`chip ${chipClass}`}>{status}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-medium">{percentage}%</span>
                      <span className="text-sm font-bold tabular-nums text-slate-900">
                        {numberFormatter.format(count)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
