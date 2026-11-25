'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Calendar,
  MapPin,
  Ticket,
  Zap,
} from 'lucide-react';
import { fetchApi, Event } from '@/lib/api';
import { DEMO_MODE } from '@/lib/demo';

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedMode, setSelectedMode] = useState('ALL');

  useEffect(() => {
    let ignore = false;
    fetchApi<{ events: Event[] }>('/events')
      .then((res) => {
        if (!ignore) setEvents(res.events || []);
      })
      .catch((err) => {
        if (!ignore) console.error('Failed to load events', err);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const categories = ['ALL', 'Technology', 'Music', 'Business', 'General'];

  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ev.description && ev.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ev.venue_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'ALL' || ev.category === selectedCategory;
    const matchesMode = selectedMode === 'ALL' || ev.seating_mode === selectedMode;

    return matchesSearch && matchesCategory && matchesMode;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Hero Section */}
      <section className="relative rounded-2xl glass border border-white/70 p-8 sm:p-12 mb-10 overflow-hidden">
        {/* Subtle Stage Lighting Ambiance */}
        <div className="absolute top-0 right-1/4 -mt-16 h-80 w-80 rounded-full bg-indigo-500/[0.06] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-10 -mb-16 h-64 w-64 rounded-full bg-sky-500/[0.04] blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-semibold text-indigo-600 tracking-wide mb-3">
            High-concurrency ticket dispatch & seat reservation
          </p>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Reserved seating and live ticket drops without collision.
          </h1>

          <p className="mt-4 text-sm sm:text-base text-slate-700 leading-relaxed">
            Interactive amphitheater seating maps with 10-minute locks, live inventory sync over server-sent events, and database row-level locking that prevents double-booking.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#events-catalog"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
            >
              <Ticket className="h-4 w-4" />
              Browse events
            </a>
            {DEMO_MODE && (
              <Link
                href="/simulate"
                className="inline-flex items-center gap-2 rounded-lg border border-white/70 glass px-5 py-2.5 text-xs font-medium text-slate-700 hover:border-slate-300 transition"
              >
                <Zap className="h-4 w-4 text-sky-700" />
                Concurrency stress lab
              </Link>
            )}
          </div>

          {/* Core System Properties */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-200 pt-6">
            <div>
              <p className="text-xl font-bold text-slate-900">0</p>
              <p className="text-xs text-slate-600 mt-0.5">Duplicate bookings</p>
            </div>
            <div>
              <p className="text-xl font-bold text-sky-700">&lt; 300 ms</p>
              <p className="text-xs text-slate-600 mt-0.5">Seat hold latency</p>
            </div>
            <div>
              <p className="text-xl font-bold text-indigo-600">10 min</p>
              <p className="text-xs text-slate-600 mt-0.5">Temporary hold window</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-700">HMAC-256</p>
              <p className="text-xs text-slate-600 mt-0.5">Signed pass verification</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <div id="events-catalog" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search events, halls, topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white/70 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Categories */}
          <div className="flex items-center gap-1 rounded-lg border border-white/70 bg-white/50 p-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  selectedCategory === cat
                    ? 'bg-indigo-50 text-indigo-600 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Mode */}
          <div className="flex items-center gap-1 rounded-lg border border-white/70 bg-white/50 p-1">
            <button
              onClick={() => setSelectedMode('ALL')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                selectedMode === 'ALL' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All formats
            </button>
            <button
              onClick={() => setSelectedMode('RESERVED')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                selectedMode === 'RESERVED' ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reserved seats
            </button>
            <button
              onClick={() => setSelectedMode('GA')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                selectedMode === 'GA' ? 'bg-sky-50 text-sky-700 font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              General admission
            </button>
          </div>
        </div>
      </div>

      {/* Events List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-xs text-slate-600">Loading scheduled events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-xl border border-white/70 glass p-12 text-center">
          <Ticket className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">No matching events found</h3>
          <p className="mt-1 text-xs text-slate-600">Try clearing filters or search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEvents.map((ev) => {
            const firstSession = ev.sessions && ev.sessions[0];
            const startDate = firstSession
              ? new Date(firstSession.starts_at).toLocaleDateString('vi-VN', {
                  weekday: 'short',
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Unscheduled';

            return (
              <div
                key={ev.id}
                className="ticket-pass flex flex-col justify-between overflow-hidden rounded-xl glass border border-white/70 transition hover:border-indigo-300"
              >
                {/* Banner Section */}
                <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                  {ev.banner_url ? (
                    <img
                      src={ev.banner_url}
                      alt={ev.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-100">
                      <Ticket className="h-10 w-10 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="rounded bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-white/70">
                      {ev.category}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium border ${
                        ev.seating_mode === 'RESERVED'
                          ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}
                    >
                      {ev.seating_mode === 'RESERVED' ? 'Reserved seating' : 'General admission'}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-base font-bold text-slate-900 line-clamp-1">
                    {ev.title}
                  </h3>

                  <p className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {ev.description || 'Premier live performance.'}
                  </p>

                  <div className="mt-3.5 space-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">{startDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{ev.venue_name}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                    <div>
                      <p className="text-[10px] text-slate-500">Refund policy</p>
                      <p className="text-xs font-medium text-emerald-700">
                        {ev.refund_percent}% up to {ev.cancel_deadline_hours}h prior
                      </p>
                    </div>

                    <Link
                      href={
                        ev.seating_mode === 'RESERVED' && firstSession
                          ? `/events/${ev.id}/seats?sessionId=${firstSession.id}`
                          : `/events/${ev.id}`
                      }
                      className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                    >
                      {ev.seating_mode === 'RESERVED' ? 'Select seats' : 'Get tickets'}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
