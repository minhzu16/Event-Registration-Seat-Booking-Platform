'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Calendar,
  MapPin,
  Users,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Activity,
  Ticket,
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
      <section className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-indigo-950/40 via-slate-900/60 to-slate-950/80 p-8 sm:p-14 overflow-hidden mb-12 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md mb-6">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>High-Demand Ticket Drops & Schedulers</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            Reserve Seats with{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-300 to-emerald-400">
              Zero Collisions
            </span>
          </h1>

          <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
            Experience ultra-fast ticket selection with interactive SVG seating maps, 10-minute holds,
            realtime status streams, and rock-solid PostgreSQL row-level locks that prevent double booking.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#events-list"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-400 transition transform hover:-translate-y-0.5"
            >
              <Ticket className="h-4 w-4" />
              Explore Events
            </a>
            <Link
              href="/simulate"
              className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-6 py-3.5 text-sm font-bold text-cyan-300 backdrop-blur-md hover:bg-cyan-900/40 hover:border-cyan-400/50 transition transform hover:-translate-y-0.5"
            >
              <Zap className="h-4 w-4 text-cyan-400" />
              Launch Concurrency Lab
            </Link>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/10 pt-6">
            <div>
              <p className="text-2xl font-black text-white">0%</p>
              <p className="text-xs text-slate-400">Double-Booking Rate</p>
            </div>
            <div>
              <p className="text-2xl font-black text-cyan-400">&lt; 300ms</p>
              <p className="text-xs text-slate-400">P95 Hold Latency</p>
            </div>
            <div>
              <p className="text-2xl font-black text-emerald-400">10 Min</p>
              <p className="text-xs text-slate-400">Seat Hold Countdown</p>
            </div>
            <div>
              <p className="text-2xl font-black text-indigo-400">HMAC-256</p>
              <p className="text-xs text-slate-400">Tamper-Proof QR Code</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <div id="events-list" className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search events, venues, topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 backdrop-blur-md focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Categories */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 p-1 backdrop-blur-md">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Mode */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 p-1 backdrop-blur-md">
            <button
              onClick={() => setSelectedMode('ALL')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                selectedMode === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setSelectedMode('RESERVED')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                selectedMode === 'RESERVED' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Seat Map
            </button>
            <button
              onClick={() => setSelectedMode('GA')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                selectedMode === 'GA' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              General Adm.
            </button>
          </div>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-400">Loading live events inventory...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-12 text-center backdrop-blur-md">
          <Ticket className="mx-auto h-12 w-12 text-slate-500" />
          <h3 className="mt-4 text-base font-semibold text-white">No matching events found</h3>
          <p className="mt-1 text-sm text-slate-400">Try adjusting your search filters or create an event in Organiser Studio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((ev) => {
            const firstSession = ev.sessions && ev.sessions[0];
            const startDate = firstSession ? new Date(firstSession.starts_at).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }) : 'TBD';

            return (
              <div
                key={ev.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-lg backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10"
              >
                {/* Banner Image */}
                <div className="relative h-48 w-full overflow-hidden bg-slate-800">
                  {ev.banner_url ? (
                    <img
                      src={ev.banner_url}
                      alt={ev.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-slate-900 to-indigo-950">
                      <Ticket className="h-12 w-12 text-indigo-400/40" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-bold text-slate-200 backdrop-blur-md border border-white/10">
                      {ev.category}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur-md border ${
                        ev.seating_mode === 'RESERVED'
                          ? 'bg-indigo-600/80 text-white border-indigo-400/30'
                          : 'bg-pink-600/80 text-white border-pink-400/30'
                      }`}
                    >
                      {ev.seating_mode === 'RESERVED' ? 'Sơ đồ ghế' : 'Vé tự do (GA)'}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition line-clamp-1">
                    {ev.title}
                  </h3>

                  <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {ev.description || 'Join us for this premier live experience.'}
                  </p>

                  <div className="mt-4 space-y-2 border-t border-white/5 pt-3 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">{startDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{ev.venue_name}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Policy</span>
                      <span className="text-xs font-semibold text-emerald-400">
                        {ev.refund_percent}% Hoàn tiền ({ev.cancel_deadline_hours}h)
                      </span>
                    </div>

                    <Link
                      href={
                        ev.seating_mode === 'RESERVED' && firstSession
                          ? `/events/${ev.id}/seats?sessionId=${firstSession.id}`
                          : `/events/${ev.id}`
                      }
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
                    >
                      {ev.seating_mode === 'RESERVED' ? 'Chọn ghế' : 'Đặt vé'}
                      <ArrowRight className="h-3.5 w-3.5" />
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
