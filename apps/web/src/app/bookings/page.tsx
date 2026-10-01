'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Ticket as TicketIcon,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { fetchApi, Booking } from '@/lib/api';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadBookings();
    window.addEventListener('auth-changed', loadBookings);
    return () => window.removeEventListener('auth-changed', loadBookings);
  }, []);

  async function loadBookings() {
    try {
      setLoading(true);
      const res = await fetchApi<{ bookings: Booking[] }>('/me/bookings');
      setBookings(res.bookings || []);
    } catch (err: any) {
      console.error('Failed to load bookings', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelModalBooking) return;
    try {
      setCancellingId(cancelModalBooking.id);
      const res = await fetchApi<{ message: string; refundAmount: number }>(
        `/bookings/${cancelModalBooking.id}/cancel`,
        { method: 'POST' }
      );
      setMessage(`Booking cancelled successfully. Refund of ${res.refundAmount.toLocaleString('vi-VN')} ₫ initiated.`);
      setCancelModalBooking(null);
      loadBookings();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel booking');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <TicketIcon className="h-6 w-6 text-indigo-400" />
            My Bookings & QR Passes
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Display these cryptographic HMAC QR codes at event entry for instant check-in.
          </p>
        </div>
        <button
          onClick={loadBookings}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {message && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-300 backdrop-blur-md">
          {message}
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="mt-3 text-xs text-slate-400">Loading your tickets...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-12 text-center backdrop-blur-md">
          <TicketIcon className="mx-auto h-12 w-12 text-slate-500 mb-3" />
          <h3 className="text-base font-bold text-white">No active bookings yet</h3>
          <p className="text-xs text-slate-400 mt-1">Explore our live events and reserve your seats now.</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition"
          >
            Explore Events
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {bookings.map((booking) => {
            const isCancelled = booking.status === 'CANCELLED';
            const startsAt = new Date(booking.starts_at).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={booking.id}
                className={`overflow-hidden rounded-3xl border ${
                  isCancelled
                    ? 'border-white/5 bg-slate-900/30 opacity-70'
                    : 'border-white/10 bg-slate-900/70 shadow-xl'
                } backdrop-blur-xl transition`}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/10 bg-slate-950/50 p-5 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-indigo-400">
                        {booking.reference}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isCancelled
                            ? 'bg-rose-950 text-rose-400 border border-rose-800/40'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                        }`}
                      >
                        {booking.status}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white mt-1">{booking.event_title}</h3>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total Paid</p>
                      <p className="font-bold text-cyan-300">
                        {Number(booking.total_amount).toLocaleString('vi-VN')} ₫
                      </p>
                    </div>

                    {!isCancelled && (
                      <button
                        onClick={() => setCancelModalBooking(booking)}
                        className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-900/30 transition"
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub details */}
                <div className="flex flex-wrap gap-4 border-b border-white/5 px-5 py-3 text-xs text-slate-300 bg-slate-950/30">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{startsAt}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{booking.venue_name}</span>
                  </div>
                </div>

                {/* Tickets with QR codes */}
                <div className="p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                    Issued Tickets ({booking.tickets?.length || 0})
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {booking.tickets?.map((t) => {
                      const isCheckedIn = Boolean(t.checkedInAt);
                      const isTicketCancelled = t.status === 'CANCELLED';

                      return (
                        <div
                          key={t.id}
                          className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-white/10 bg-slate-800/40 p-4 backdrop-blur-md"
                        >
                          {/* QR Code image */}
                          <div className="flex flex-col items-center shrink-0 bg-white p-2.5 rounded-xl shadow-lg">
                            {t.qrDataUrl ? (
                              <img
                                src={t.qrDataUrl}
                                alt="Pass QR"
                                className="h-28 w-28 object-contain"
                              />
                            ) : (
                              <QrCode className="h-28 w-28 text-slate-900" />
                            )}
                            <span className="text-[9px] font-mono text-slate-500 mt-1 max-w-[110px] truncate">
                              {t.code.substring(0, 16)}...
                            </span>
                          </div>

                          {/* Ticket Meta */}
                          <div className="flex-1 space-y-1.5 text-center sm:text-left">
                            <p className="text-sm font-bold text-white">{t.attendeeName}</p>
                            <p className="text-xs text-indigo-300 font-semibold">{t.ticketTypeName}</p>

                            {t.seatSection ? (
                              <p className="text-xs text-slate-300 font-mono">
                                {t.seatSection} — Row <strong>{t.seatRow}</strong>, Seat{' '}
                                <strong>{t.seatNumber}</strong>
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400">General Admission</p>
                            )}

                            <div className="pt-2">
                              {isCheckedIn ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle2 className="h-3 w-3" /> Checked In
                                </span>
                              ) : isTicketCancelled ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-300 border border-rose-500/30">
                                  <XCircle className="h-3 w-3" /> Cancelled
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300 border border-indigo-500/30">
                                  <Clock className="h-3 w-3" /> Ready for Scan
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-white">Cancel Booking?</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              According to the event policy, you will receive a{' '}
              <strong className="text-emerald-400">
                {cancelModalBooking.refund_percent}% refund (
                {(
                  (Number(cancelModalBooking.total_amount) * cancelModalBooking.refund_percent) /
                  100
                ).toLocaleString('vi-VN')}{' '}
                ₫)
              </strong>
              . Your seats will be immediately returned to the pool and offered to the waiting list.
            </p>

            <div className="flex gap-3">
              <button
                disabled={Boolean(cancellingId)}
                onClick={handleConfirmCancel}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500 transition disabled:opacity-50"
              >
                {cancellingId ? 'Processing...' : 'Confirm Cancellation'}
              </button>
              <button
                onClick={() => setCancelModalBooking(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
              >
                Keep Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
