'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  ShieldCheck,
  Ticket,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { fetchApi, Event, Session } from '@/lib/api';

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  async function loadEvent() {
    try {
      setLoading(true);
      const res = await fetchApi<{ event: Event; sessions: Session[] }>(`/events/${eventId}`);
      setEvent(res.event);
      setSessions(res.sessions || []);
      if (res.sessions && res.sessions.length > 0) {
        setSelectedSessionId(res.sessions[0].id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  }

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0];

  async function handleBookGaTicket(ticketTypeId: string) {
    if (!selectedSession) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // Create hold
      const holdRes = await fetchApi<{ holdId: string }>(`/sessions/${selectedSession.id}/holds`, {
        method: 'POST',
        body: JSON.stringify({
          ticketTypeId,
          quantity,
        }),
      });

      // Confirm hold immediately for GA
      await fetchApi(`/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      });

      router.push('/bookings');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to book GA tickets');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        <p className="mt-3 text-xs text-slate-400">Loading event details...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-4xl py-24 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
        <h2 className="mt-4 text-lg font-bold text-white">Event Not Found</h2>
        <Link href="/" className="mt-4 inline-block text-xs text-indigo-400 hover:underline">
          Return to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Explore
      </Link>

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      {/* Hero Banner */}
      <div className="relative h-64 sm:h-96 w-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-8 bg-slate-900">
        {event.banner_url && (
          <img src={event.banner_url} alt={event.title} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex gap-2 mb-3">
            <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-bold text-indigo-300 border border-white/10 backdrop-blur-md">
              {event.category}
            </span>
            <span className="rounded-full bg-indigo-600/80 px-3 py-1 text-xs font-bold text-white border border-indigo-400/30 backdrop-blur-md">
              {event.seating_mode === 'RESERVED' ? 'Reserved Seating' : 'General Admission'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white">{event.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Description & Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-md">
            <h2 className="text-base font-bold text-white mb-3">About this Event</h2>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {event.description || 'No description provided.'}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-md space-y-4">
            <h2 className="text-base font-bold text-white">Event Location & Times</h2>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <MapPin className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>{event.venue_name}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Cancellation Policy: Full {event.refund_percent}% refund available up to{' '}
                {event.cancel_deadline_hours} hours prior to the show.
              </span>
            </div>
          </div>
        </div>

        {/* Right: Booking Box */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl shadow-xl">
            <h3 className="text-base font-bold text-white mb-4">Select Session</h3>

            {/* Session selector */}
            <div className="space-y-2 mb-6">
              {sessions.map((sess) => {
                const isSelected = sess.id === selectedSessionId;
                const dateStr = new Date(sess.starts_at).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <button
                    key={sess.id}
                    onClick={() => setSelectedSessionId(sess.id)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/40 text-white font-bold shadow'
                        : 'border-white/10 bg-slate-800/40 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{dateStr}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Booking Action */}
            {event.seating_mode === 'RESERVED' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  This event features numbered reserved seating. Choose your exact seats on our interactive
                  seat map.
                </p>
                <Link
                  href={`/events/${event.id}/seats?sessionId=${selectedSessionId}`}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-cyan-400 transition"
                >
                  <Ticket className="h-4 w-4" /> Open Interactive Seat Map
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">General Admission / Free Seating Passes:</p>

                {selectedSession?.ticket_types?.map((tt) => {
                  const remaining = Math.max(0, tt.capacity - tt.reserved);
                  return (
                    <div
                      key={tt.id}
                      className="rounded-2xl border border-white/10 bg-slate-800/50 p-4 space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold text-white">{tt.name}</p>
                          <p className="text-xs text-slate-400">
                            {remaining > 0 ? `${remaining} passes remaining` : 'Sold Out'}
                          </p>
                        </div>
                        <span className="text-base font-black text-emerald-400">
                          {Number(tt.price).toLocaleString('vi-VN')} ₫
                        </span>
                      </div>

                      {remaining > 0 ? (
                        <button
                          disabled={isSubmitting}
                          onClick={() => handleBookGaTicket(tt.id)}
                          className="w-full rounded-xl bg-pink-600 py-2.5 text-xs font-bold text-white shadow-md shadow-pink-600/30 hover:bg-pink-500 transition disabled:opacity-50"
                        >
                          {isSubmitting ? 'Booking Pass...' : 'Book General Pass'}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="w-full rounded-xl bg-slate-700 py-2.5 text-xs font-bold text-slate-400 cursor-not-allowed"
                        >
                          Sold Out
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
