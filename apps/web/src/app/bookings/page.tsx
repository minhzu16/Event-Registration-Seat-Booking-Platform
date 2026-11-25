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
  ShieldCheck,
  Clock,
  X,
} from 'lucide-react';
import { fetchApi, Booking } from '@/lib/api';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // SafeTix™ Dynamic Rolling Pass state (DICE / Ticketmaster pattern)
  const [activeRollingTicket, setActiveRollingTicket] = useState<{
    id: string;
    attendeeName: string;
    tierName: string;
    seatInfo?: string;
    rollingCode: string;
    qrDataUrl: string;
    remainingSeconds: number;
  } | null>(null);
  const [rollingLoading, setRollingLoading] = useState(false);

  async function fetchRollingPass(ticketId: string, attendeeName: string, tierName: string, seatInfo?: string) {
    try {
      setRollingLoading(true);
      const res = await fetchApi<{
        ticketId: string;
        rollingCode: string;
        qrDataUrl: string;
        remainingSeconds: number;
      }>(`/tickets/${ticketId}/rolling-pass`);

      setActiveRollingTicket({
        id: ticketId,
        attendeeName,
        tierName,
        seatInfo,
        rollingCode: res.rollingCode,
        qrDataUrl: res.qrDataUrl,
        remainingSeconds: res.remainingSeconds || 15,
      });
    } catch (err) {
      console.error('Failed to load SafeTix pass', err);
    } finally {
      setRollingLoading(false);
    }
  }

  useEffect(() => {
    if (!activeRollingTicket) return;

    const timer = setInterval(() => {
      setActiveRollingTicket((prev) => {
        if (!prev) return null;
        if (prev.remainingSeconds <= 1) {
          // Time to refresh rolling token
          fetchRollingPass(prev.id, prev.attendeeName, prev.tierName, prev.seatInfo);
          return { ...prev, remainingSeconds: 15 };
        }
        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeRollingTicket?.id]);

  async function loadBookings() {
    try {
      setLoading(true);
      const res = await fetchApi<{ bookings: Booking[] }>('/me/bookings');
      setBookings(res.bookings || []);
    } catch (err) {
      console.error('Failed to load bookings', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // `loading` starts true, so the first fetch only sets state once the promise settles.
    let ignore = false;
    const refresh = () =>
      fetchApi<{ bookings: Booking[] }>('/me/bookings')
        .then((res) => {
          if (!ignore) setBookings(res.bookings || []);
        })
        .catch((err) => console.error('Failed to load bookings', err))
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    void refresh();
    window.addEventListener('auth-changed', refresh);
    return () => {
      ignore = true;
      window.removeEventListener('auth-changed', refresh);
    };
  }, []);

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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel booking');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-indigo-600" />
            My bookings and admission passes
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Present these cryptographic HMAC QR passes at the entrance scanner for instant check-in.
          </p>
        </div>
        <button
          onClick={loadBookings}
          className="flex items-center gap-1.5 rounded-md border border-white/70 glass px-3 py-1.5 text-xs text-slate-700 hover:text-slate-900 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-700">
          {message}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-xs text-slate-600">Loading your tickets...</p>
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-xl border border-white/70 glass p-12 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-slate-500 mb-2" />
          <h3 className="text-sm font-semibold text-slate-900">No active bookings yet</h3>
          <p className="text-xs text-slate-600 mt-1">Explore scheduled events and reserve your seats now.</p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
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
                    ? 'border-white/50 glass opacity-60'
                    : 'border-white/70 glass'
                } transition`}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 bg-white/50 p-4 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-indigo-600">
                        {booking.reference}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                          isCancelled
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {booking.status}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{booking.event_title}</h3>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-600">Paid amount</p>
                      <p className="font-semibold text-slate-900">
                        {Number(booking.total_amount).toLocaleString('vi-VN')} ₫
                      </p>
                    </div>

                    {!isCancelled && (
                      <button
                        onClick={() => setCancelModalBooking(booking)}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition"
                      >
                        Cancel reservation
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub details */}
                <div className="flex flex-wrap gap-4 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-600 bg-white/30">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{startsAt}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-500" />
                    <span>{booking.venue_name}</span>
                  </div>
                </div>

                {/* Issued Tickets */}
                <div className="p-4">
                  <p className="text-xs font-medium text-slate-600 mb-3">
                    Issued tickets ({booking.tickets?.length || 0})
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {booking.tickets?.map((t) => {
                      const isCheckedIn = Boolean(t.checkedInAt);

                      return (
                        <div
                          key={t.id}
                          className="flex flex-col sm:flex-row items-center gap-3.5 rounded-lg border border-white/70 glass p-3.5"
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
                            <p className="text-xs font-bold text-slate-900">{t.attendeeName}</p>
                            <p className="text-xs text-indigo-600 font-medium">{t.ticketTypeName}</p>

                            {t.seatSection ? (
                              <p className="text-xs text-slate-700 font-mono">
                                {t.seatSection} • Row {t.seatRow}-{t.seatNumber}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-600">General admission</p>
                            )}

                            <div className="pt-2 flex flex-wrap items-center gap-2">
                              {isCheckedIn ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Checked in
                                </span>
                              ) : isCancelled ? (
                                <span className="text-[11px] text-red-600">Cancelled pass</span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      const seatLabel = t.seatSection
                                        ? `${t.seatSection} • Row ${t.seatRow}-${t.seatNumber}`
                                        : 'General Admission';
                                      fetchRollingPass(t.id, t.attendeeName, t.ticketTypeName, seatLabel);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition shadow-sm"
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5 text-sky-700" />
                                    SafeTix™ Live Pass
                                  </button>
                                  <span className="text-[10px] text-slate-500 hidden sm:inline">Rolling code</span>
                                </>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/70 glass-strong p-5 shadow-xl shadow-indigo-900/10">
            <div className="flex items-center gap-2 text-indigo-600 mb-3">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-bold text-slate-900">Cancel booking confirmation</h3>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Are you sure you want to cancel booking{' '}
              <strong className="text-slate-900">{cancelModalBooking.reference}</strong>?
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
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-700 hover:text-slate-900 transition"
              >
                Keep booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SafeTix™ Rolling Pass Modal (Anti-Scalping Dynamic Barcode) */}
      {activeRollingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/70 glass-strong p-6 shadow-xl shadow-indigo-900/10 text-center">
            {/* Close Button */}
            <button
              onClick={() => setActiveRollingTicket(null)}
              className="absolute right-4 top-4 rounded-full p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 tracking-wide uppercase shadow-inner mb-3">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-700 animate-pulse" />
              SafeTix™ Verified Pass
            </div>

            <h3 className="text-base font-bold text-slate-900">{activeRollingTicket.attendeeName}</h3>
            <p className="text-xs text-indigo-600 font-medium">{activeRollingTicket.tierName}</p>
            {activeRollingTicket.seatInfo && (
              <p className="text-xs text-slate-600 font-mono mt-0.5">{activeRollingTicket.seatInfo}</p>
            )}

            {/* Interactive QR Display with Scanline */}
            <div className="relative mx-auto my-5 flex h-60 w-60 items-center justify-center rounded-2xl border-2 border-sky-200 bg-white p-3 shadow-lg shadow-indigo-900/10 overflow-hidden">
              {/* Scanline Animation */}
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-500 to-transparent animate-bounce opacity-80 pointer-events-none" />

              {activeRollingTicket.qrDataUrl ? (
                <img
                  src={activeRollingTicket.qrDataUrl}
                  alt="Dynamic SafeTix Pass"
                  className="h-full w-full object-contain select-none"
                />
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
                </div>
              )}
            </div>

            {/* Circular Progress Countdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 px-2 font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-sky-700" /> Rotating barcode
                </span>
                <span className="font-bold text-sky-700">
                  Refreshes in {activeRollingTicket.remainingSeconds}s
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-1000 ease-linear"
                  style={{ width: `${(activeRollingTicket.remainingSeconds / 15) * 100}%` }}
                />
              </div>
            </div>

            {/* Fraud & Screenshot Warning */}
            <div className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 text-[11px] text-indigo-700 leading-snug">
              ⚡ <strong>Anti-Screenshot Protection:</strong> This QR code regenerates cryptographically every 15 seconds. Screenshots will be rejected at the gate scanner.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
