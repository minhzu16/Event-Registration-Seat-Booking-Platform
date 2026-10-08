'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Calendar,
  MapPin,
  Sparkles,
  Ticket,
  Zap,
} from 'lucide-react';
import { fetchApi, Event } from '@/lib/api';

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedMode, setSelectedMode] = useState('ALL');

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      setLoading(true);
      const res = await fetchApi<{ events: Event[] }>('/events');
      setEvents(res.events || []);
    } catch (err) {
      console.error('Failed to load events', err);
    } finally {
      setLoading(false);
    }
  }

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
      <section className="relative rounded-2xl border border-white/[0.08] bg-[#0c101a] p-8 sm:p-12 mb-10 overflow-hidden">
        {/* Subtle Stage Lighting Ambiance */}
        <div className="absolute top-0 right-1/4 -mt-16 h-80 w-80 rounded-full bg-amber-500/[0.06] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-10 -mb-16 h-64 w-64 rounded-full bg-cyan-500/[0.04] blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-semibold text-amber-400 tracking-wide mb-3">
            High-concurrency ticket dispatch & seat reservation
          </p>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Reserved seating and live ticket drops without collision.
          </h1>

          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed">
            Interactive amphitheater seating maps with 10-minute locks, live inventory sync over server-sent events, and database row-level locking that prevents double-booking.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#events-catalog"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
            >
              <Ticket className="h-4 w-4" />
              Browse events
            </a>
            <Link
              href="/simulate"
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#141b29] px-5 py-2.5 text-xs font-medium text-slate-200 hover:border-white/[0.25] transition"
            >
              <Zap className="h-4 w-4 text-cyan-400" />
              Concurrency stress lab
            </Link>
          </div>

          {/* Core System Properties */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/[0.08] pt-6">
            <div>
              <p className="text-xl font-bold text-white">0</p>
              <p className="text-xs text-slate-400 mt-0.5">Duplicate bookings</p>
            </div>
            <div>
              <p className="text-xl font-bold text-cyan-400">&lt; 300 ms</p>
              <p className="text-xs text-slate-400 mt-0.5">Seat hold latency</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-400">10 min</p>
              <p className="text-xs text-slate-400 mt-0.5">Temporary hold window</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-400">HMAC-256</p>
              <p className="text-xs text-slate-400 mt-0.5">Signed pass verification</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <div id="events-catalog" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search events, halls, topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-[#0c101a] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Categories */}
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0c101a] p-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  selectedCategory === cat
                    ? 'bg-[#1a2336] text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Mode */}
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0c101a] p-1">
            <button
              onClick={() => setSelectedMode('ALL')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                selectedMode === 'ALL' ? 'bg-[#1a2336] text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All formats
            </button>
            <button
              onClick={() => setSelectedMode('RESERVED')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                selectedMode === 'RESERVED' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Reserved seats
            </button>
            <button
              onClick={() => setSelectedMode('GA')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                selectedMode === 'GA' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
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
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <p className="mt-3 text-xs text-slate-400">Loading scheduled events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101a] p-12 text-center">
          <Ticket className="mx-auto h-10 w-10 text-slate-500" />
          <h3 className="mt-3 text-sm font-semibold text-white">No matching events found</h3>
          <p className="mt-1 text-xs text-slate-400">Try clearing filters or search terms.</p>
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
                className="ticket-pass flex flex-col justify-between overflow-hidden rounded-xl bg-[#0f1523] border border-white/[0.08] transition hover:border-amber-400/30"
              >
                {/* Banner Section */}
                <div className="relative h-44 w-full overflow-hidden bg-[#090d16]">
                  {ev.banner_url ? (
                    <img
                      src={ev.banner_url}
                      alt={ev.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#0e1422]">
                      <Ticket className="h-10 w-10 text-slate-600" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="rounded bg-[#080b11]/90 px-2 py-0.5 text-[10px] font-medium text-slate-300 border border-white/[0.1]">
                      {ev.category}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium border ${
                        ev.seating_mode === 'RESERVED'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                      }`}
                    >
                      {ev.seating_mode === 'RESERVED' ? 'Reserved seating' : 'General admission'}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-base font-bold text-white line-clamp-1">
                    {ev.title}
                  </h3>

                  <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {ev.description || 'Premier live performance.'}
                  </p>

                  <div className="mt-3.5 space-y-1.5 border-t border-white/[0.06] pt-3 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">{startDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{ev.venue_name}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3">
                    <div>
                      <p className="text-[10px] text-slate-400">Refund policy</p>
                      <p className="text-xs font-medium text-emerald-400">
                        {ev.refund_percent}% up to {ev.cancel_deadline_hours}h prior
                      </p>
                    </div>

                    <Link
                      href={
                        ev.seating_mode === 'RESERVED' && firstSession
                          ? `/events/${ev.id}/seats?sessionId=${firstSession.id}`
                          : `/events/${ev.id}`
                      }
                      className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
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
