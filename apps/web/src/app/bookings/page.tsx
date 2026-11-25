'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Ticket as TicketIcon, RefreshCw } from 'lucide-react';
import { fetchApi, Booking } from '@/lib/api';
import { BookingCard } from '@/components/bookings/BookingCard';
import { CancelBookingModal } from '@/components/bookings/CancelBookingModal';
import { RollingPassModal, RollingTicketState } from '@/components/bookings/RollingPassModal';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // SafeTix™ Dynamic Rolling Pass state (DICE / Ticketmaster pattern)
  const [activeRollingTicket, setActiveRollingTicket] = useState<RollingTicketState | null>(null);

  async function fetchRollingPass(ticketId: string, attendeeName: string, tierName: string, seatInfo?: string) {
    try {
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
    }
  }

  useEffect(() => {
    if (!activeRollingTicket) return;

    const timer = setInterval(() => {
      setActiveRollingTicket((prev) => {
        if (!prev) return null;
        if (prev.remainingSeconds <= 1) {
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
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onCancelClick={setCancelModalBooking}
              onOpenRollingPass={fetchRollingPass}
            />
          ))}
        </div>
      )}

      {cancelModalBooking && (
        <CancelBookingModal
          booking={cancelModalBooking}
          isCancelling={Boolean(cancellingId)}
          onConfirm={handleConfirmCancel}
          onClose={() => setCancelModalBooking(null)}
        />
      )}

      {activeRollingTicket && (
        <RollingPassModal
          ticket={activeRollingTicket}
          onClose={() => setActiveRollingTicket(null)}
        />
      )}
    </div>
  );
}
