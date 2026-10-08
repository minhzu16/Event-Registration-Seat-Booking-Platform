'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Ticket as TicketIcon,
  Calendar,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  QrCode,
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
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-amber-400" />
            My bookings and admission passes
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Present these cryptographic HMAC QR passes at the entrance scanner for instant check-in.
          </p>
        </div>
        <button
          onClick={loadBookings}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0e1422] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3.5 text-xs text-emerald-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <p className="mt-3 text-xs text-slate-400">Loading your tickets...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101a] p-12 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-slate-500 mb-2" />
          <h3 className="text-sm font-semibold text-white">No active bookings yet</h3>
          <p className="text-xs text-slate-400 mt-1">Explore scheduled events and reserve your seats now.</p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {bookings.map((booking) => {
            const isCancelled = booking.status === 'CANCELLED';
            const startsAt = new Date(booking.starts_at).toLocaleDateString('vi-VN', {
              weekday: 'short',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={booking.id}
                className={`overflow-hidden rounded-xl border ${
                  isCancelled
                    ? 'border-white/[0.04] bg-[#090d16] opacity-60'
                    : 'border-white/[0.08] bg-[#0c101a]'
                } transition`}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.06] bg-[#0f1523] p-4 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-amber-400">
                        {booking.reference}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                          isCancelled
                            ? 'bg-rose-950 text-rose-400 border border-rose-800/40'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                        }`}
                      >
                        {booking.status}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1">{booking.event_title}</h3>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400">Paid amount</p>
                      <p className="font-semibold text-white">
                        {Number(booking.total_amount).toLocaleString('vi-VN')} ₫
                      </p>
                    </div>

                    {!isCancelled && (
                      <button
                        onClick={() => setCancelModalBooking(booking)}
                        className="rounded-md border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-900/30 transition"
                      >
                        Cancel reservation
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub details */}
                <div className="flex flex-wrap gap-4 border-b border-white/[0.04] px-4 py-2.5 text-xs text-slate-400 bg-[#0a0e18]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-amber-400" />
                    <span>{startsAt}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span>{booking.venue_name}</span>
                  </div>
                </div>

                {/* Issued Tickets */}
                <div className="p-4">
                  <p className="text-xs font-medium text-slate-400 mb-3">
                    Issued tickets ({booking.tickets?.length || 0})
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {booking.tickets?.map((t) => {
                      const isCheckedIn = Boolean(t.checkedInAt);

                      return (
                        <div
                          key={t.id}
                          className="flex flex-col sm:flex-row items-center gap-3.5 rounded-lg border border-white/[0.06] bg-[#121824] p-3.5"
                        >
                          {/* QR Code image */}
                          <div className="flex flex-col items-center shrink-0 bg-white p-2 rounded-md shadow-sm">
                            {t.qrDataUrl ? (
                              <img
                                src={t.qrDataUrl}
                                alt="Pass QR"
                                className="h-24 w-24 object-contain"
                              />
                            ) : (
                              <QrCode className="h-24 w-24 text-slate-900" />
                            )}
                            <span className="text-[9px] font-mono text-slate-600 mt-1 max-w-[95px] truncate">
                              {t.code.substring(0, 14)}...
                            </span>
                          </div>

                          {/* Ticket Meta */}
                          <div className="flex-1 space-y-1 text-center sm:text-left">
                            <p className="text-xs font-bold text-white">{t.attendeeName}</p>
                            <p className="text-xs text-amber-300 font-medium">{t.ticketTypeName}</p>

                            {t.seatSection ? (
                              <p className="text-xs text-slate-300 font-mono">
                                {t.seatSection} • Row {t.seatRow}-{t.seatNumber}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400">General admission</p>
                            )}

                            <div className="pt-2">
                              {isCheckedIn ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Checked in
                                </span>
                              ) : isCancelled ? (
                                <span className="text-[11px] text-rose-400">Cancelled pass</span>
                              ) : (
                                <span className="text-[11px] text-slate-400">Ready for scan</span>
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

      {/* Cancel Modal */}
      {cancelModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#0c101a] p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 mb-3">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-bold text-white">Cancel booking confirmation</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to cancel booking{' '}
              <strong className="text-white">{cancelModalBooking.reference}</strong>?
              Seats will be released immediately to waitlist attendees or live inventory.
            </p>

            <div className="mt-5 flex gap-2.5">
              <button
                disabled={Boolean(cancellingId)}
                onClick={handleConfirmCancel}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-xs font-semibold text-white hover:bg-rose-500 transition disabled:opacity-50"
              >
                {cancellingId ? 'Processing...' : 'Confirm cancellation'}
              </button>
              <button
                onClick={() => setCancelModalBooking(null)}
                className="rounded-lg border border-white/[0.1] px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white transition"
              >
                Keep booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
