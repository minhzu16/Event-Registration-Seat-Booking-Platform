'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { fetchApi, Seat, Session, API_BASE, BookingConfirmation } from '@/lib/api';
import {
  SeatMapResponse,
  HoldResponse,
  updateSeatsOnHold,
  updateSeatsOnRelease,
  updateSeatsOnBooked,
  updateSeatsOnMyHold,
  fireBookingConfetti,
} from '@/components/seats/seat-utils';
import { SessionHeader } from '@/components/seats/SessionHeader';
import { SeatMapCanvas } from '@/components/seats/SeatMapCanvas';
import { HoldPanel } from '@/components/seats/HoldPanel';
import { CheckoutModal } from '@/components/seats/CheckoutModal';
import { WaitlistModal } from '@/components/seats/WaitlistModal';
import { ErrorMessage } from '@/components/seats/ErrorMessage';

export default function SeatMapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const eventId = params.id as string;
  void eventId;
  const initialSessionId = searchParams.get('sessionId') || '';

  const [session, setSession] = useState<Session | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mock_card' | 'momo' | 'vnpay'>('mock_card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState<BookingConfirmation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  function applySeatMap(res: SeatMapResponse) {
    setSession(res.session);
    setEventTitle(res.session.event_title || '');
    setSeats(res.seats || []);
    const heldByMe = res.seats.filter((s) => s.isHeldByMe);
    if (heldByMe.length > 0 && heldByMe[0].holdExpiresAt) {
      setSelectedSeatIds(heldByMe.map((s) => s.id));
      setHoldExpiresAt(heldByMe[0].holdExpiresAt);
      if (heldByMe[0].holdId) setActiveHoldId(heldByMe[0].holdId);
    }
  }

  async function loadSeatMap(sessionId: string) {
    try {
      const res = await fetchApi<SeatMapResponse>(`/sessions/${sessionId}/seats`);
      applySeatMap(res);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load auditorium seating plan');
    } finally {
      setLoading(false);
    }
  }

  function connectSse(sessionId: string) {
    const sseUrl = `${API_BASE}/sessions/${sessionId}/stream`;
    const eventSource = new EventSource(sseUrl);
    eventSource.onopen = () => setSseConnected(true);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'seat_held') setSeats((prev) => updateSeatsOnHold(prev, payload.seatIds, payload.holdId));
        else if (payload.type === 'seat_released') setSeats((prev) => updateSeatsOnRelease(prev, payload.seatIds));
        else if (payload.type === 'seat_booked') setSeats((prev) => updateSeatsOnBooked(prev, payload.seatIds));
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

  useEffect(() => {
    if (!initialSessionId) return;
    let ignore = false;
    fetchApi<SeatMapResponse>(`/sessions/${initialSessionId}/seats`)
      .then((res) => { if (!ignore) applySeatMap(res); })
      .catch((err) => {
        if (!ignore) setErrorMessage(err instanceof Error ? err.message : 'Unable to load auditorium seating plan');
      })
      .finally(() => { if (!ignore) setLoading(false); });
    const cleanup = connectSse(initialSessionId);
    return () => { ignore = true; cleanup?.(); };
  }, [initialSessionId]);

  useEffect(() => {
    if (!holdExpiresAt) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
      setSecondsRemaining(diff);
      if (diff === 0) {
        clearInterval(interval);
        setActiveHoldId(null);
        setHoldExpiresAt(null);
        setSecondsRemaining(null);
        setSelectedSeatIds([]);
        setErrorMessage('Your 10-minute hold window expired. Seats were returned to live inventory.');
        if (initialSessionId) loadSeatMap(initialSessionId);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt, initialSessionId]);

  function toggleSeatSelection(seat: Seat) {
    if (activeHoldId || seat.status !== 'AVAILABLE') return;
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
      const res = await fetchApi<HoldResponse>(`/sessions/${session.id}/holds`, {
        method: 'POST',
        body: JSON.stringify({ seatIds: selectedSeatIds }),
      });
      setActiveHoldId(res.holdId);
      setHoldExpiresAt(res.expiresAt);
      setSecondsRemaining(res.secondsRemaining);
      setSeats((prev) => updateSeatsOnMyHold(prev, selectedSeatIds, res.holdId, res.expiresAt));
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Another attendee just held one of your selected seats. Please choose another.'
      );
      if (session) { setLoading(true); loadSeatMap(session.id); }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmBooking() {
    if (!activeHoldId) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const res = await fetchApi<BookingConfirmation>(`/holds/${activeHoldId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod }),
      });
      setBookingConfirmed(res);
      setActiveHoldId(null);
      setHoldExpiresAt(null);
      setSecondsRemaining(null);
      fireBookingConfetti();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('expired')) {
        setErrorMessage('Your hold expired before payment was completed. The seats were released.');
        setIsCheckoutOpen(false);
        setActiveHoldId(null);
        setHoldExpiresAt(null);
        setSecondsRemaining(null);
        setSelectedSeatIds([]);
      } else {
        setErrorMessage(message || 'Payment confirmation failed');
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
      setSecondsRemaining(null);
      setSelectedSeatIds([]);
      setIsCheckoutOpen(false);
      setLoading(true);
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
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to join waitlist');
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
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : `No ${qty} adjacent seats available in this tier.`
      );
    }
  }

  const selectedSeatSet = useMemo(() => new Set(selectedSeatIds), [selectedSeatIds]);
  const selectedSeats = useMemo(
    () => seats.filter((s) => selectedSeatSet.has(s.id)),
    [seats, selectedSeatSet]
  );
  const totalPrice = useMemo(
    () => selectedSeats.reduce((acc, s) => acc + s.price, 0),
    [selectedSeats]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <SessionHeader
        eventTitle={eventTitle} sseConnected={sseConnected}
        secondsRemaining={secondsRemaining} onOpenCheckout={() => setIsCheckoutOpen(true)}
      />

      <ErrorMessage message={errorMessage} onDismiss={() => setErrorMessage(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <SeatMapCanvas
          seats={seats} selectedSeatSet={selectedSeatSet}
          activeHoldId={activeHoldId} loading={loading}
          zoomScale={zoomScale} onZoomChange={setZoomScale}
          onToggleSeat={toggleSeatSelection}
        />

        <HoldPanel
          selectedSeats={selectedSeats} totalPrice={totalPrice}
          activeHoldId={activeHoldId} isSubmitting={isSubmitting}
          onSuggestSeats={handleSuggestSeats} onToggleSeatSelection={toggleSeatSelection}
          onCreateHold={handleCreateHold} onOpenCheckout={() => setIsCheckoutOpen(true)}
          onReleaseHold={handleReleaseHold} onOpenWaitlist={() => setWaitlistOpen(true)}
        />
      </div>

      <CheckoutModal
        isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)}
        bookingConfirmed={bookingConfirmed} paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod} selectedSeatsCount={selectedSeats.length}
        totalPrice={totalPrice} isSubmitting={isSubmitting}
        onConfirmBooking={handleConfirmBooking}
        onDone={() => { setIsCheckoutOpen(false); router.push('/'); }}
      />

      <WaitlistModal
        isOpen={waitlistOpen} onClose={() => setWaitlistOpen(false)}
        waitlistSuccess={waitlistSuccess} isSubmitting={isSubmitting}
        onJoinWaitlist={handleJoinWaitlist}
      />
    </div>
  );
}
