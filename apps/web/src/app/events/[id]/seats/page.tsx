'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  QrCode,
  Sparkles,
  Users,
  RefreshCw,
  X,
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
        setErrorMessage('Your seat hold has expired. The seats were released back to inventory.');
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

      // Check if user already holds seats
      const heldByMe = res.seats.filter((s) => s.isHeldByMe);
      if (heldByMe.length > 0 && heldByMe[0].holdExpiresAt) {
        setSelectedSeatIds(heldByMe.map((s) => s.id));
        setHoldExpiresAt(heldByMe[0].holdExpiresAt);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load seating map');
    } finally {
      setLoading(false);
    }
  }

  function connectSse(sessionId: string) {
    const sse = new EventSource(`${API_BASE}/sessions/${sessionId}/stream`);

    sse.addEventListener('connected', () => {
      setSseConnected(true);
    });

    sse.addEventListener('seat_held', (e) => {
      const data = JSON.parse(e.data);
      setSeats((prev) =>
        prev.map((seat) => {
          if (data.seatIds.includes(seat.id)) {
            return {
              ...seat,
              status: 'HELD',
              holdExpiresAt: data.expiresAt,
            };
          }
          return seat;
        })
      );
    });

    sse.addEventListener('seat_released', (e) => {
      const data = JSON.parse(e.data);
      setSeats((prev) =>
        prev.map((seat) => {
          if (data.seatIds.includes(seat.id)) {
            return {
              ...seat,
              status: 'AVAILABLE',
              isHeldByMe: false,
              holdExpiresAt: undefined,
            };
          }
          return seat;
        })
      );
    });

    sse.addEventListener('seat_booked', (e) => {
      const data = JSON.parse(e.data);
      setSeats((prev) =>
        prev.map((seat) => {
          if (data.seatIds.includes(seat.id)) {
            return {
              ...seat,
              status: 'BOOKED',
              isHeldByMe: false,
            };
          }
          return seat;
        })
      );
    });

    sse.onerror = () => {
      setSseConnected(false);
    };

    return () => sse.close();
  }

  function toggleSeatSelection(seat: Seat) {
    if (seat.status !== 'AVAILABLE' && !seat.isHeldByMe && !selectedSeatIds.includes(seat.id)) {
      return; // Cannot select booked or held by others
    }

    if (activeHoldId) {
      return; // Already holding these seats; proceed to checkout or release
    }

    setSelectedSeatIds((prev) =>
      prev.includes(seat.id) ? prev.filter((id) => id !== seat.id) : [...prev, seat.id]
    );
  }

  async function handleCreateHold() {
    if (selectedSeatIds.length === 0 || !session) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const idempotencyKey = `hold-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const res = await fetchApi<{
        holdId: string;
        expiresAt: string;
        seatIds: string[];
      }>(`/sessions/${session.id}/holds`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          seatIds: selectedSeatIds,
          strategy: 'pessimistic',
        }),
      });

      setActiveHoldId(res.holdId);
      setHoldExpiresAt(res.expiresAt);
      setIsCheckoutOpen(true);
    } catch (err: any) {
      if (err.status === 409) {
        setErrorMessage('One or more of your selected seats were just seized by another attendee! Please choose alternative seats.');
      } else {
        setErrorMessage(err.message || 'Failed to hold seats');
      }
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

      const idempotencyKey = `confirm-${activeHoldId}`;

      const res = await fetchApi<{
        booking: any;
        tickets: any[];
      }>(`/holds/${activeHoldId}/confirm`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          paymentMethod,
        }),
      });

      setBookingConfirmed(res);
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      if (err.status === 410) {
        setErrorMessage('Your hold expired before payment was confirmed. The seats have been released.');
        setIsCheckoutOpen(false);
        setActiveHoldId(null);
        setSelectedSeatIds([]);
      } else {
        setErrorMessage(err.message || 'Booking confirmation failed');
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
      setErrorMessage(err.message || `No ${qty} adjacent seats available together.`);
    }
  }

  // Calculate pricing
  const selectedSeats = seats.filter((s) => selectedSeatIds.includes(s.id));
  const totalPrice = selectedSeats.reduce((acc, s) => acc + s.price, 0);

  // SVG dimensions
  const maxX = Math.max(...seats.map((s) => s.x), 500) + 70;
  const maxY = Math.max(...seats.map((s) => s.y), 400) + 70;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4 mb-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Events
          </Link>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            {eventTitle || 'Reserved Seating Map'}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                sseConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {sseConnected ? 'Live Realtime' : 'Reconnecting'}
            </span>
          </h1>
        </div>

        {/* Live Hold Timer Bar */}
        {secondsRemaining !== null && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/30 px-4 py-2.5 backdrop-blur-md">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <Clock className={`h-5 w-5 ${secondsRemaining < 120 ? 'animate-pulse text-rose-400' : ''}`} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Seats Held For You</p>
              <p className="text-xl font-black text-white font-mono">
                {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
              </p>
            </div>
            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="ml-2 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
            >
              Checkout Now
            </button>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Seat Map Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left: Interactive SVG Area */}
        <div className="lg:col-span-3 flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Stage Banner */}
          <div className="w-full max-w-lg mb-8">
            <div className="h-8 rounded-b-2xl bg-gradient-to-r from-indigo-500/20 via-cyan-500/40 to-indigo-500/20 border-b-2 border-cyan-400/60 flex items-center justify-center shadow-lg shadow-cyan-500/10">
              <span className="text-xs font-black tracking-widest text-cyan-300 uppercase">
                STAGE / SCREEN
              </span>
            </div>
          </div>

          {/* SVG Map Container */}
          <div className="w-full overflow-x-auto flex justify-center py-4">
            {loading ? (
              <div className="py-24 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                <p className="mt-2 text-xs text-slate-400">Loading seat layout...</p>
              </div>
            ) : (
              <svg
                width={maxX}
                height={maxY}
                className="select-none transition-all duration-300"
                viewBox={`0 0 ${maxX} ${maxY}`}
              >
                {seats.map((seat) => {
                  const isSelected = selectedSeatIds.includes(seat.id);
                  const isHeldByMe = seat.isHeldByMe || (isSelected && activeHoldId);
                  const isHeldByOther = seat.status === 'HELD' && !isHeldByMe;
                  const isBooked = seat.status === 'BOOKED';
                  const isBlocked = seat.status === 'BLOCKED';

                  let fillColor = seat.color || '#6366f1';
                  let strokeColor = 'rgba(255,255,255,0.2)';
                  let opacity = 1;
                  let cursor = 'pointer';

                  if (isBooked) {
                    fillColor = '#334155';
                    strokeColor = '#1e293b';
                    opacity = 0.45;
                    cursor = 'not-allowed';
                  } else if (isBlocked) {
                    fillColor = '#1e293b';
                    strokeColor = '#0f172a';
                    opacity = 0.25;
                    cursor = 'not-allowed';
                  } else if (isHeldByOther) {
                    fillColor = '#ef4444';
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
                      className="transition-transform duration-150 hover:scale-110"
                      style={{ cursor }}
                    >
                      <circle
                        cx={seat.x}
                        cy={seat.y}
                        r={13}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 1.5}
                        opacity={opacity}
                        className={isHeldByMe ? 'animate-pulse' : ''}
                      />
                      <text
                        x={seat.x}
                        y={seat.y + 4}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="bold"
                        fill={isBooked ? '#94a3b8' : '#ffffff'}
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
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 border-t border-white/5 pt-6 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full bg-indigo-500 border border-indigo-400" />
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full bg-amber-500 border border-amber-400 animate-pulse" />
              <span>Selected / Held by You</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full bg-rose-500 border border-rose-400" />
              <span>Held by Others</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full bg-slate-700 opacity-60" />
              <span>Booked</span>
            </div>
          </div>
        </div>

        {/* Right: Selection Summary & Actions */}
        <div className="flex flex-col justify-between rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl shadow-2xl">
          <div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              Selected Seats
            </h3>

            {/* Quick Suggest Best Adjacent Seats */}
            {!activeHoldId && (
              <div className="mb-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/30 p-3">
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-2">
                  ✨ Auto-Suggest Contiguous Seats
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleSuggestSeats(2)}
                    className="rounded-lg border border-indigo-500/30 bg-indigo-900/40 px-2 py-1.5 text-[11px] font-bold text-indigo-200 hover:bg-indigo-800/60 transition"
                  >
                    2 Seats
                  </button>
                  <button
                    onClick={() => handleSuggestSeats(3)}
                    className="rounded-lg border border-indigo-500/30 bg-indigo-900/40 px-2 py-1.5 text-[11px] font-bold text-indigo-200 hover:bg-indigo-800/60 transition"
                  >
                    3 Seats
                  </button>
                  <button
                    onClick={() => handleSuggestSeats(4)}
                    className="rounded-lg border border-indigo-500/30 bg-indigo-900/40 px-2 py-1.5 text-[11px] font-bold text-indigo-200 hover:bg-indigo-800/60 transition"
                  >
                    4 Seats
                  </button>
                </div>
              </div>
            )}

            {selectedSeats.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                Click any available seat on the map to add it to your reservation.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {selectedSeats.map((seat) => (
                  <div
                    key={seat.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-800/60 p-3 text-xs backdrop-blur-md"
                  >
                    <div>
                      <p className="font-bold text-white">
                        {seat.section} — Row {seat.rowLabel}, Seat {seat.seatNumber}
                      </p>
                      <p className="text-[11px] text-indigo-300">{seat.tierName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">
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

            {/* Total computation */}
            <div className="mt-6 border-t border-white/10 pt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Tickets ({selectedSeats.length})</span>
                <span>{totalPrice.toLocaleString('vi-VN')} ₫</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Processing Fee</span>
                <span className="text-emerald-400">0 ₫ (Free)</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white border-t border-white/5 pt-2">
                <span>Total Due</span>
                <span className="text-base text-cyan-300">{totalPrice.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-8 space-y-3">
            {!activeHoldId ? (
              <button
                disabled={selectedSeatIds.length === 0 || isSubmitting}
                onClick={handleCreateHold}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Holding Seats...
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4" /> Hold Seats (10 Mins)
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setIsCheckoutOpen(true)}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-400 transition flex items-center justify-center gap-2"
                >
                  <CreditCard className="h-4 w-4" /> Proceed to Checkout
                </button>
                <button
                  onClick={handleReleaseHold}
                  className="w-full rounded-xl border border-rose-500/30 bg-rose-950/20 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-900/30 transition"
                >
                  Release Hold
                </button>
              </div>
            )}

            {/* Waitlist option */}
            <button
              onClick={() => setWaitlistOpen(true)}
              className="w-full text-center text-xs text-slate-400 hover:text-indigo-300 transition py-1"
            >
              Can’t find your desired seats? <strong className="underline">Join Waiting List</strong>
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
            {bookingConfirmed ? (
              <div className="text-center py-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-4 glow-success">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h3 className="text-2xl font-black text-white">Booking Confirmed!</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Reference:{' '}
                  <strong className="text-indigo-400 font-mono text-sm">
                    {bookingConfirmed.booking.reference}
                  </strong>
                </p>

                <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left space-y-3">
                  <p className="text-xs font-bold text-white">Your Issued Tickets with HMAC QR:</p>
                  <div className="flex gap-4 overflow-x-auto py-2">
                    {bookingConfirmed.tickets.map((t: any) => (
                      <div
                        key={t.id}
                        className="flex flex-col items-center rounded-xl border border-white/10 bg-white p-3 shrink-0"
                      >
                        {t.qrDataUrl && (
                          <img src={t.qrDataUrl} alt="QR Code" className="h-32 w-32 object-contain" />
                        )}
                        <p className="mt-2 text-[10px] font-bold text-slate-900">{t.attendee_name}</p>
                        <p className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">
                          {t.code.substring(0, 14)}...
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <Link
                    href="/bookings"
                    className="flex-1 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition"
                  >
                    View in My Bookings
                  </Link>
                  <button
                    onClick={() => {
                      setIsCheckoutOpen(false);
                      router.push('/');
                    }}
                    className="rounded-xl border border-white/10 px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">Checkout & Payment</h3>
                    <p className="text-xs text-slate-400">Mock Payment Sandbox</p>
                  </div>
                  <button
                    onClick={() => setIsCheckoutOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-2">Select Payment Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setPaymentMethod('mock_card')}
                        className={`rounded-xl border p-3 text-center transition ${
                          paymentMethod === 'mock_card'
                            ? 'border-indigo-500 bg-indigo-950/40 text-white font-bold'
                            : 'border-white/10 bg-slate-800/40 text-slate-400 hover:text-white'
                        }`}
                      >
                        Credit Card
                      </button>
                      <button
                        onClick={() => setPaymentMethod('momo')}
                        className={`rounded-xl border p-3 text-center transition ${
                          paymentMethod === 'momo'
                            ? 'border-pink-500 bg-pink-950/40 text-white font-bold'
                            : 'border-white/10 bg-slate-800/40 text-slate-400 hover:text-white'
                        }`}
                      >
                        MoMo
                      </button>
                      <button
                        onClick={() => setPaymentMethod('vnpay')}
                        className={`rounded-xl border p-3 text-center transition ${
                          paymentMethod === 'vnpay'
                            ? 'border-cyan-500 bg-cyan-950/40 text-white font-bold'
                            : 'border-white/10 bg-slate-800/40 text-slate-400 hover:text-white'
                        }`}
                      >
                        VNPay
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 space-y-2">
                    <div className="flex justify-between text-slate-400">
                      <span>Seats Reserved:</span>
                      <span className="text-white font-semibold">{selectedSeats.length} seats</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Total Amount:</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        {totalPrice.toLocaleString('vi-VN')} ₫
                      </span>
                    </div>
                  </div>

                  <button
                    disabled={isSubmitting}
                    onClick={handleConfirmBooking}
                    className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-400 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" /> Processing Payment...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Complete Booking & Issue Tickets
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-400" />
                Join Waiting List
              </h3>
              <button onClick={() => setWaitlistOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {waitlistSuccess ? (
              <div className="text-center py-4 space-y-3">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                <p className="text-sm font-bold text-white">You are now on the Waiting List!</p>
                <p className="text-xs text-slate-400">
                  As soon as an attendee cancels or a hold expires, our automated background engine will
                  allocate an exclusive hold offer to your account.
                </p>
                <button
                  onClick={() => setWaitlistOpen(false)}
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 transition mt-2"
                >
                  Got It
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-slate-300">
                  When seats become available via cancellations or expired holds, the system automatically
                  picks the next waiting attendee and grants a 24-hour exclusive hold offer.
                </p>
                <button
                  disabled={isSubmitting}
                  onClick={handleJoinWaitlist}
                  className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Joining Queue...' : 'Confirm Join Waiting List'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
