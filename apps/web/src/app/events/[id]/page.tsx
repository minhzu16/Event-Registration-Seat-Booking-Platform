'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  ShieldCheck,
  Ticket,
  ArrowLeft,
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
  const [quantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let ignore = false;
    fetchApi<{ event: Event; sessions: Session[] }>(`/events/${eventId}`)
      .then((res) => {
        if (ignore) return;
        setEvent(res.event);
        setSessions(res.sessions || []);
        if (res.sessions && res.sessions.length > 0) {
          setSelectedSessionId(res.sessions[0].id);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load event details');
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
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
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load event details');
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

      const holdRes = await fetchApi<{ holdId: string }>(`/sessions/${selectedSession.id}/holds`, {
        method: 'POST',
        body: JSON.stringify({
          ticketTypeId,
          quantity,
        }),
      });

      await fetchApi(`/holds/${holdRes.holdId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod: 'mock_card' }),
      });

      router.push('/bookings');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Booking request failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <p className="mt-3 text-xs text-slate-600">Loading event details...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
        <h2 className="mt-3 text-base font-bold text-slate-900">Event not found</h2>
        <Link href="/" className="mt-3 inline-block text-xs text-indigo-600 hover:underline">
          Return to events catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition mb-5"
      >
        <ArrowLeft className="h-3 w-3" /> Back to events
      </Link>

      {errorMessage && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          {errorMessage}
        </div>
      )}

      {/* Hero Banner */}
      <div className="relative h-60 sm:h-80 w-full rounded-xl overflow-hidden border border-white/70 mb-6 bg-slate-100">
        {event.banner_url && (
          <img src={event.banner_url} alt={event.title} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent" />
        <div className="absolute bottom-5 left-5 right-5">
          <div className="flex gap-2 mb-2">
            <span className="rounded bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 border border-white/70">
              {event.category}
            </span>
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600 border border-indigo-200">
              {event.seating_mode === 'RESERVED' ? 'Reserved seating' : 'General admission'}
            </span>
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{event.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Description & Info */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-white/70 glass p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-2.5">About this event</h2>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
              {event.description || 'No detailed overview provided.'}
            </p>
          </div>

          <div className="rounded-xl border border-white/70 glass p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Venue details & guarantees</h2>
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <MapPin className="h-4 w-4 text-sky-700 shrink-0" />
              <span>{event.venue_name}</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-700">
              <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>
                Refund guarantee: {event.refund_percent}% refund available up to {event.cancel_deadline_hours} hours prior to scheduled showtime.
              </span>
            </div>
          </div>
        </div>

        {/* Right: Booking Box */}
        <div className="space-y-5">
          <div className="rounded-xl border border-white/70 glass p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Select session</h3>

            {/* Session selector */}
            <div className="space-y-1.5 mb-5">
              {sessions.map((sess) => {
                const isSelected = sess.id === selectedSessionId;
                const dateStr = new Date(sess.starts_at).toLocaleDateString('vi-VN', {
                  weekday: 'short',
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <button
                    key={sess.id}
                    onClick={() => setSelectedSessionId(sess.id)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${
                      isSelected
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-600 font-medium'
                        : 'border-slate-200 bg-white/50 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{dateStr}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Booking Action */}
            {event.seating_mode === 'RESERVED' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  This hall features numbered reserved seating. Select your preferred seat from the amphitheater seating plan.
                </p>
                <Link
                  href={`/events/${event.id}/seats?sessionId=${selectedSessionId}`}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                >
                  <Ticket className="h-3.5 w-3.5" /> Open seating plan
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">Available admission tiers:</p>

                {selectedSession?.ticket_types?.map((tt) => {
                  const remaining = Math.max(0, tt.capacity - tt.reserved);
                  return (
                    <div
                      key={tt.id}
                      className="rounded-lg border border-slate-200 bg-white/50 p-3 space-y-2.5"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{tt.name}</p>
                          <p className="text-[11px] text-slate-600">
                            {remaining > 0 ? `${remaining} passes available` : 'Sold out'}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-indigo-600">
                          {Number(tt.price).toLocaleString('vi-VN')} ₫
                        </span>
                      </div>

                      {remaining > 0 ? (
                        <button
                          disabled={isSubmitting}
                          onClick={() => handleBookGaTicket(tt.id)}
                          className="w-full rounded bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                        >
                          {isSubmitting ? 'Reserving pass...' : 'Reserve pass'}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="w-full rounded bg-slate-200 py-2 text-xs font-medium text-slate-500 cursor-not-allowed"
                        >
                          Sold out
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
