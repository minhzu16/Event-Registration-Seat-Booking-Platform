'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Sparkles,
  Users,
  RefreshCw,
  X,
  Ticket,
} from 'lucide-react';
import { fetchApi, Seat, Session, API_BASE } from '@/lib/api';

export default function SeatMapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const eventId = params.id as string;
  const initialSessionId = searchParams.get('sessionId') || '';

  const [session, setSession] = useState<Session | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  // Active Hold state
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Checkout modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mock_card' | 'momo' | 'vnpay'>('mock_card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Waitlist state
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  useEffect(() => {
    if (initialSessionId) {
      loadSeatMap(initialSessionId);
      connectSse(initialSessionId);
    }
  }, [initialSessionId]);

  // Hold Countdown Timer
  useEffect(() => {
    if (!holdExpiresAt) {
      setSecondsRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
      setSecondsRemaining(diff);

      if (diff === 0) {
        clearInterval(interval);
        setActiveHoldId(null);
        setHoldExpiresAt(null);
        setSelectedSeatIds([]);
        setErrorMessage('Your 10-minute hold window expired. Seats were returned to live inventory.');
        if (initialSessionId) loadSeatMap(initialSessionId);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt, initialSessionId]);

  async function loadSeatMap(sessionId: string) {
    try {
      setLoading(true);
      const res = await fetchApi<{
        session: any;
        seats: Seat[];
        serverTime: string;
      }>(`/sessions/${sessionId}/seats`);

      setSession(res.session);
      setEventTitle(res.session.event_title);
      setSeats(res.seats || []);

      const heldByMe = res.seats.filter((s) => s.isHeldByMe);
      if (heldByMe.length > 0 && heldByMe[0].holdExpiresAt) {
        setSelectedSeatIds(heldByMe.map((s) => s.id));
        setHoldExpiresAt(heldByMe[0].holdExpiresAt);
        if (heldByMe[0].holdId) setActiveHoldId(heldByMe[0].holdId);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to load auditorium seating plan');
    } finally {
      setLoading(false);
    }
  }

  function connectSse(sessionId: string) {
    const sseUrl = `${API_BASE}/sessions/${sessionId}/stream`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      setSseConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'seat_held') {
          setSeats((prev) =>
            prev.map((s) =>
              payload.seatIds.includes(s.id)
                ? {
                    ...s,
                    status: 'HELD',
                    isHeldByMe: s.holdId === payload.holdId || s.isHeldByMe,
                  }
                : s
            )
          );
        } else if (payload.type === 'seat_released') {
          setSeats((prev) =>
            prev.map((s) =>
              payload.seatIds.includes(s.id)
                ? {
                    ...s,
                    status: 'AVAILABLE',
                    isHeldByMe: false,
                    holdId: undefined,
                    holdExpiresAt: undefined,
                  }
                : s
            )
          );
        } else if (payload.type === 'seat_booked') {
          setSeats((prev) =>
            prev.map((s) =>
              payload.seatIds.includes(s.id)
                ? { ...s, status: 'BOOKED', isHeldByMe: false }
                : s
            )
          );
        }
      } catch (e) {
        console.error('SSE parse error', e);
      }
    };

    eventSource.onerror = () => {
      setSseConnected(false);
      eventSource.close();
      setTimeout(() => connectSse(sessionId), 4000);
    };

    return () => eventSource.close();
  }

  function toggleSeatSelection(seat: Seat) {
    if (activeHoldId) return; // Locked during active hold
    if (seat.status !== 'AVAILABLE') return;

    setErrorMessage(null);
    if (selectedSeatIds.includes(seat.id)) {
      setSelectedSeatIds((prev) => prev.filter((id) => id !== seat.id));
    } else {
      if (selectedSeatIds.length >= 6) {
        setErrorMessage('Maximum selection limit is 6 seats per transaction.');
        return;
      }
      setSelectedSeatIds((prev) => [...prev, seat.id]);
    }
  }

  async function handleCreateHold() {
    if (!session || selectedSeatIds.length === 0) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const res = await fetchApi<{
        holdId: string;
        expiresAt: string;
        secondsRemaining: number;
      }>(`/sessions/${session.id}/holds`, {
        method: 'POST',
        body: JSON.stringify({
          seatIds: selectedSeatIds,
        }),
      });

      setActiveHoldId(res.holdId);
      setHoldExpiresAt(res.expiresAt);
      setSecondsRemaining(res.secondsRemaining);

      setSeats((prev) =>
        prev.map((s) =>
          selectedSeatIds.includes(s.id)
            ? { ...s, status: 'HELD', isHeldByMe: true, holdId: res.holdId, holdExpiresAt: res.expiresAt }
            : s
        )
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Another attendee just held one of your selected seats. Please choose another.');
      if (session) loadSeatMap(session.id);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmBooking() {
    if (!activeHoldId) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const res = await fetchApi<{
        booking: any;
        tickets: any[];
      }>(`/holds/${activeHoldId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod,
        }),
      });

      setBookingConfirmed(res);
      setActiveHoldId(null);
      setHoldExpiresAt(null);

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#06b6d4', '#10b981'],
      });
    } catch (err: any) {
      if (err.message && err.message.includes('expired')) {
        setErrorMessage('Your hold expired before payment was completed. The seats were released.');
        setIsCheckoutOpen(false);
        setActiveHoldId(null);
        setSelectedSeatIds([]);
      } else {
        setErrorMessage(err.message || 'Payment confirmation failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReleaseHold() {
    if (!activeHoldId) return;
    try {
      await fetchApi(`/holds/${activeHoldId}`, { method: 'DELETE' });
      setActiveHoldId(null);
      setHoldExpiresAt(null);
      setSelectedSeatIds([]);
      setIsCheckoutOpen(false);
      if (session) loadSeatMap(session.id);
    } catch (err) {
      console.error('Failed to release hold', err);
    }
  }

  async function handleJoinWaitlist() {
    if (!session) return;
    try {
      setIsSubmitting(true);
      await fetchApi(`/sessions/${session.id}/waitlist`, {
        method: 'POST',
        body: JSON.stringify({ quantity: 1 }),
      });
      setWaitlistSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to join waitlist');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSuggestSeats(qty: number) {
    if (!session) return;
    try {
      setErrorMessage(null);
      const res = await fetchApi<{
        suggestion: { seatIds: string[]; section: string; rowLabel: string; seatNumbers: number[] };
      }>(`/sessions/${session.id}/seats/suggest?quantity=${qty}`);
      setSelectedSeatIds(res.suggestion.seatIds);
    } catch (err: any) {
      setErrorMessage(err.message || `No ${qty} adjacent seats available in this tier.`);
    }
  }

  const selectedSeats = seats.filter((s) => selectedSeatIds.includes(s.id));
  const totalPrice = selectedSeats.reduce((acc, s) => acc + s.price, 0);

  const maxX = Math.max(...seats.map((s) => s.x), 500) + 70;
  const maxY = Math.max(...seats.map((s) => s.y), 400) + 70;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/[0.08] pb-4 mb-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-1.5"
          >
            <ArrowLeft className="h-3 w-3" /> Back to events
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {eventTitle || 'Reserved seating map'}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${
                sseConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  sseConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {sseConnected ? 'Live sync connected' : 'Connecting stream...'}
            </span>
          </div>
        </div>

        {/* Live Hold Timer HUD */}
        {secondsRemaining !== null && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-[#14120a] px-3.5 py-2">
            <Clock className={`h-4 w-4 ${secondsRemaining < 120 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
            <div>
              <p className="text-[10px] text-amber-400/90 font-medium">Hold active</p>
              <p className="text-base font-bold text-white font-mono leading-none">
                {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
              </p>
            </div>
            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="ml-2 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
            >
              Confirm & pay
            </button>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Seat Map Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: SVG Stage & Auditorium */}
        <div className="lg:col-span-3 flex flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#0c101a] p-6 shadow-sm overflow-hidden">
          {/* Stage Focal Point */}
          <div className="w-full max-w-md mb-8">
            <div className="stage-curved h-10 flex items-center justify-center">
              <span className="text-[11px] font-semibold tracking-wider text-amber-400/90">
                Stage & main acoustic focus
              </span>
            </div>
          </div>

          {/* SVG Map Container */}
          <div className="w-full overflow-x-auto flex justify-center py-2">
            {loading ? (
              <div className="py-20 text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                <p className="mt-2 text-xs text-slate-400">Loading seat layout...</p>
              </div>
            ) : (
              <svg
                width={maxX}
                height={maxY}
                className="select-none"
                viewBox={`0 0 ${maxX} ${maxY}`}
              >
                {seats.map((seat) => {
                  const isSelected = selectedSeatIds.includes(seat.id);
                  const isHeldByMe = seat.isHeldByMe || (isSelected && activeHoldId);
                  const isHeldByOther = seat.status === 'HELD' && !isHeldByMe;
                  const isBooked = seat.status === 'BOOKED';
                  const isBlocked = seat.status === 'BLOCKED';

                  let fillColor = seat.color || '#38bdf8';
                  let strokeColor = 'rgba(255,255,255,0.15)';
                  let opacity = 1;
                  let cursor = 'pointer';

                  if (isBooked) {
                    fillColor = '#1e293b';
                    strokeColor = '#0f172a';
                    opacity = 0.45;
                    cursor = 'not-allowed';
                  } else if (isBlocked) {
                    fillColor = '#0f172a';
                    strokeColor = '#020617';
                    opacity = 0.25;
                    cursor = 'not-allowed';
                  } else if (isHeldByOther) {
                    fillColor = '#dc2626';
                    strokeColor = '#f87171';
                    cursor = 'not-allowed';
                  } else if (isHeldByMe || isSelected) {
                    fillColor = '#f59e0b';
                    strokeColor = '#fbbf24';
                  }

                  return (
                    <g
                      key={seat.id}
                      onClick={() => toggleSeatSelection(seat)}
                      className="transition-transform duration-100 hover:scale-105"
                      style={{ cursor }}
                    >
                      <circle
                        cx={seat.x}
                        cy={seat.y}
                        r={13}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 2.5 : 1}
                        opacity={opacity}
                      />
                      <text
                        x={seat.x}
                        y={seat.y + 4}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="600"
                        fill={isBooked ? '#64748b' : '#ffffff'}
                        className="pointer-events-none"
                      >
                        {seat.seatNumber}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Seat Legend */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-5 border-t border-white/[0.06] pt-5 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-cyan-500 border border-cyan-400" />
              <span>Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-500 border border-amber-400" />
              <span>Selected by you</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-600 border border-rose-400" />
              <span>Held by others</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-slate-800 border border-slate-700" />
              <span>Booked</span>
            </div>
          </div>
        </div>

        {/* Right: Reservation Panel */}
        <div className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#0c101a] p-5 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-white mb-3">
              Seat reservation
            </h3>

            {/* Adjacent seat quick picker */}
            {!activeHoldId && (
              <div className="mb-4 rounded-lg border border-white/[0.06] bg-[#121824] p-3">
                <span className="text-[11px] font-medium text-slate-300 block mb-2">
                  Auto-find adjacent seats
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleSuggestSeats(2)}
                    className="rounded border border-white/[0.1] bg-[#182234] px-2 py-1 text-xs font-medium text-slate-200 hover:border-amber-400/50 transition"
                  >
                    2 seats
                  </button>
                  <button
                    onClick={() => handleSuggestSeats(3)}
                    className="rounded border border-white/[0.1] bg-[#182234] px-2 py-1 text-xs font-medium text-slate-200 hover:border-amber-400/50 transition"
                  >
                    3 seats
                  </button>
                  <button
                    onClick={() => handleSuggestSeats(4)}
                    className="rounded border border-white/[0.1] bg-[#182234] px-2 py-1 text-xs font-medium text-slate-200 hover:border-amber-400/50 transition"
                  >
                    4 seats
                  </button>
                </div>
              </div>
            )}

            {selectedSeats.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/[0.08] p-5 text-center text-xs text-slate-400">
                Click any available seat on the map or pick adjacent seats above.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {selectedSeats.map((seat) => (
                  <div
                    key={seat.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#121824] p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {seat.section} • Row {seat.rowLabel}-{seat.seatNumber}
                      </p>
                      <p className="text-[11px] text-slate-400">{seat.tierName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-amber-300">
                        {seat.price.toLocaleString('vi-VN')} ₫
                      </span>
                      {!activeHoldId && (
                        <button
                          onClick={() => toggleSeatSelection(seat)}
                          className="text-slate-400 hover:text-rose-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Price breakdown */}
            <div className="mt-5 border-t border-white/[0.06] pt-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Tickets ({selectedSeats.length})</span>
                <span>{totalPrice.toLocaleString('vi-VN')} ₫</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Processing fee</span>
                <span className="text-emerald-400 font-medium">0 ₫</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white border-t border-white/[0.06] pt-2">
                <span>Total amount</span>
                <span className="text-amber-400">{totalPrice.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>
          </div>

          {/* Action Area */}
          <div className="mt-6 space-y-2.5">
            {!activeHoldId ? (
              <button
                disabled={selectedSeatIds.length === 0 || isSubmitting}
                onClick={handleCreateHold}
                className="w-full rounded-lg bg-amber-500 py-3 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Locking seats...
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5" /> Hold seats for 10 minutes
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setIsCheckoutOpen(true)}
                  className="w-full rounded-lg bg-emerald-600 py-3 text-xs font-semibold text-white hover:bg-emerald-500 transition flex items-center justify-center gap-2"
                >
                  <CreditCard className="h-3.5 w-3.5" /> Confirm and pay
                </button>
                <button
                  onClick={handleReleaseHold}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#121824] py-2 text-xs font-medium text-slate-400 hover:text-white transition"
                >
                  Release hold
                </button>
              </div>
            )}

            {/* Waiting list */}
            <button
              onClick={() => setWaitlistOpen(true)}
              className="w-full text-center text-xs text-slate-400 hover:text-amber-400 transition py-1"
            >
              Seats full? <span className="underline">Join waiting list</span>
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#0c101a] p-6 shadow-2xl">
            {bookingConfirmed ? (
              <div className="text-center py-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-3">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-white">Reservation confirmed</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Reference: <span className="font-mono text-amber-400 font-semibold">{bookingConfirmed.booking.reference}</span>
                </p>

                {/* Issued Tickets with HMAC QR */}
                <div className="mt-5 rounded-lg border border-white/[0.08] bg-[#080b11] p-4 text-left space-y-3">
                  <p className="text-xs font-semibold text-slate-300">Issued entrance passes:</p>
                  <div className="flex gap-3 overflow-x-auto py-1">
                    {bookingConfirmed.tickets.map((t: any) => (
                      <div
                        key={t.id}
                        className="flex flex-col items-center rounded-lg bg-white p-3 shrink-0"
                      >
                        {t.qrDataUrl && (
                          <img src={t.qrDataUrl} alt="QR Code" className="h-28 w-28 object-contain" />
                        )}
                        <p className="mt-1.5 text-[10px] font-bold text-slate-900">{t.attendee_name}</p>
                        <p className="text-[9px] text-slate-500 font-mono truncate max-w-[110px]">
                          {t.code.substring(0, 14)}...
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex gap-2.5">
                  <Link
                    href="/bookings"
                    className="flex-1 rounded-lg bg-amber-500 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
                  >
                    View tickets in passes
                  </Link>
                  <button
                    onClick={() => {
                      setIsCheckoutOpen(false);
                      router.push('/');
                    }}
                    className="rounded-lg border border-white/[0.1] px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-5">
                  <div>
                    <h3 className="text-base font-bold text-white">Payment and confirmation</h3>
                    <p className="text-xs text-slate-400">Simulated payment gateway</p>
                  </div>
                  <button
                    onClick={() => setIsCheckoutOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="text-slate-300 font-medium block mb-2">Payment method</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setPaymentMethod('mock_card')}
                        className={`rounded-lg border p-2.5 text-center transition ${
                          paymentMethod === 'mock_card'
                            ? 'border-amber-400 bg-amber-500/10 text-amber-300 font-semibold'
                            : 'border-white/[0.08] bg-[#121824] text-slate-400 hover:text-white'
                        }`}
                      >
                        Direct Card
                      </button>
                      <button
                        onClick={() => setPaymentMethod('momo')}
                        className={`rounded-lg border p-2.5 text-center transition ${
                          paymentMethod === 'momo'
                            ? 'border-pink-500 bg-pink-500/10 text-pink-300 font-semibold'
                            : 'border-white/[0.08] bg-[#121824] text-slate-400 hover:text-white'
                        }`}
                      >
                        MoMo
                      </button>
                      <button
                        onClick={() => setPaymentMethod('vnpay')}
                        className={`rounded-lg border p-2.5 text-center transition ${
                          paymentMethod === 'vnpay'
                            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300 font-semibold'
                            : 'border-white/[0.08] bg-[#121824] text-slate-400 hover:text-white'
                        }`}
                      >
                        VNPay
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/[0.08] bg-[#080b11] p-3.5 space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Seats locked:</span>
                      <span className="text-white font-medium">{selectedSeats.length} seats</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Total:</span>
                      <span className="text-amber-400 font-bold text-sm">
                        {totalPrice.toLocaleString('vi-VN')} ₫
                      </span>
                    </div>
                  </div>

                  <button
                    disabled={isSubmitting}
                    onClick={handleConfirmBooking}
                    className="w-full rounded-lg bg-emerald-600 py-3 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Authorizing payment...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Pay {totalPrice.toLocaleString('vi-VN')} ₫
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Waitlist Modal */}
      {waitlistOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/[0.1] bg-[#0c101a] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5 mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-400" />
                Join waiting list
              </h3>
              <button onClick={() => setWaitlistOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {waitlistSuccess ? (
              <div className="text-center py-3 space-y-2">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                <p className="text-xs font-semibold text-white">Added to waiting list</p>
                <p className="text-xs text-slate-400">
                  When a seat expires or is released, the scheduler automatically reserves a 24-hour hold offer for you.
                </p>
                <button
                  onClick={() => setWaitlistOpen(false)}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition mt-2"
                >
                  Understood
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-slate-300 leading-relaxed">
                  When seats become available via cancellations or expired holds, the system automatically allocates the next ticket to waiting attendees.
                </p>
                <button
                  disabled={isSubmitting}
                  onClick={handleJoinWaitlist}
                  className="w-full rounded-lg bg-amber-500 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Confirm position in queue'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
