import confetti from 'canvas-confetti';
import { Seat, Session } from '@/lib/api';

export interface HoldResponse {
  holdId: string;
  expiresAt: string;
  secondsRemaining: number;
}

export interface SeatMapResponse {
  session: Session;
  seats: Seat[];
  serverTime: string;
}

export interface SeatRenderStyle {
  fillColor: string;
  strokeColor: string;
  opacity: number;
  cursor: string;
}

export interface SeatBounds {
  maxX: number;
  maxY: number;
}

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function calculateSeatBounds(seats: Seat[]): SeatBounds {
  let maxX = 500;
  let maxY = 400;
  for (const s of seats) {
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
  }
  return { maxX: maxX + 70, maxY: maxY + 70 };
}

export function sortSeats(seats: Seat[]): Seat[] {
  return [...seats].sort((a, b) => {
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    if (a.rowLabel !== b.rowLabel) return a.rowLabel.localeCompare(b.rowLabel);
    return a.seatNumber - b.seatNumber;
  });
}

export function getSeatRenderStyle(
  seat: Seat,
  isSelected: boolean,
  isHeldByMe: boolean
): SeatRenderStyle {
  const isHeldByOther = seat.status === 'HELD' && !isHeldByMe;
  const isBooked = seat.status === 'BOOKED';
  const isBlocked = seat.status === 'BLOCKED';

  let fillColor = seat.color || '#0284c7';
  let strokeColor = 'rgba(255,255,255,0.8)';
  let opacity = 1;
  let cursor = 'pointer';

  if (isBooked) {
    fillColor = '#cbd5e1';
    strokeColor = '#94a3b8';
    opacity = 0.6;
    cursor = 'not-allowed';
  } else if (isBlocked) {
    fillColor = '#94a3b8';
    strokeColor = '#64748b';
    opacity = 0.4;
    cursor = 'not-allowed';
  } else if (isHeldByOther) {
    fillColor = '#dc2626';
    strokeColor = '#ef4444';
    cursor = 'not-allowed';
  } else if (isHeldByMe || isSelected) {
    // Dark fill + accent ring: must not collide with ticket-tier colours (which come from data).
    fillColor = '#0f172a';
    strokeColor = '#4f46e5';
  }

  return { fillColor, strokeColor, opacity, cursor };
}

export function updateSeatsOnHold(prev: Seat[], seatIds: string[], holdId?: string): Seat[] {
  return prev.map((s) =>
    seatIds.includes(s.id)
      ? { ...s, status: 'HELD', isHeldByMe: s.holdId === holdId || s.isHeldByMe }
      : s
  );
}

export function updateSeatsOnRelease(prev: Seat[], seatIds: string[]): Seat[] {
  return prev.map((s) =>
    seatIds.includes(s.id)
      ? { ...s, status: 'AVAILABLE', isHeldByMe: false, holdId: undefined, holdExpiresAt: undefined }
      : s
  );
}

export function updateSeatsOnBooked(prev: Seat[], seatIds: string[]): Seat[] {
  return prev.map((s) => (seatIds.includes(s.id) ? { ...s, status: 'BOOKED', isHeldByMe: false } : s));
}

export function updateSeatsOnMyHold(
  prev: Seat[],
  selectedSeatIds: string[],
  holdId: string,
  expiresAt: string
): Seat[] {
  return prev.map((s) =>
    selectedSeatIds.includes(s.id)
      ? { ...s, status: 'HELD', isHeldByMe: true, holdId, holdExpiresAt: expiresAt }
      : s
  );
}

export function fireBookingConfetti(): void {
  confetti({
    particleCount: 70,
    spread: 60,
    origin: { y: 0.6 },
    colors: ['#4f46e5', '#0284c7', '#059669'],
  });
}
