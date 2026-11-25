'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { BookingConfirmation } from '@/lib/api';

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingConfirmed: BookingConfirmation | null;
  paymentMethod: 'mock_card' | 'momo' | 'vnpay';
  setPaymentMethod: (method: 'mock_card' | 'momo' | 'vnpay') => void;
  selectedSeatsCount: number;
  totalPrice: number;
  isSubmitting: boolean;
  onConfirmBooking: () => void;
  onDone: () => void;
}

export function CheckoutModal({
  isOpen,
  onClose,
  bookingConfirmed,
  paymentMethod,
  setPaymentMethod,
  selectedSeatsCount,
  totalPrice,
  isSubmitting,
  onConfirmBooking,
  onDone,
}: CheckoutModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-xl glass-strong border border-white/70 p-6 shadow-2xl">
        {bookingConfirmed ? (
          <div className="text-center py-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 mb-3">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 id="checkout-modal-title" className="text-xl font-bold text-slate-900">Reservation confirmed</h3>
            <p className="mt-1 text-xs text-slate-600">
              Reference: <span className="font-mono text-indigo-600 font-semibold">{bookingConfirmed.booking.reference}</span>
            </p>

            {/* Issued Tickets with HMAC QR */}
            <div className="mt-5 rounded-lg border border-slate-200 bg-white/50 p-4 text-left space-y-3">
              <p className="text-xs font-semibold text-slate-700">Issued entrance passes:</p>
              <div className="flex gap-3 overflow-x-auto py-1">
                {bookingConfirmed.tickets.map((t) => (
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
                className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                View tickets in passes
              </Link>
              <button
                onClick={onDone}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-700 hover:text-slate-900 transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5">
              <div>
                <h3 id="checkout-modal-title" className="text-base font-bold text-slate-900">Payment and confirmation</h3>
                <p className="text-xs text-slate-600">Simulated payment gateway</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng cửa sổ thanh toán"
                className="text-slate-500 hover:text-slate-900 p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-medium block mb-2">Payment method</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPaymentMethod('mock_card')}
                    className={`rounded-lg border p-2.5 text-center transition ${
                      paymentMethod === 'mock_card'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-600 font-semibold'
                        : 'border-slate-200 bg-white/50 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Direct Card
                  </button>
                  <button
                    onClick={() => setPaymentMethod('momo')}
                    className={`rounded-lg border p-2.5 text-center transition ${
                      paymentMethod === 'momo'
                        ? 'border-pink-500 bg-pink-50 text-pink-700 font-semibold'
                        : 'border-slate-200 bg-white/50 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    MoMo
                  </button>
                  <button
                    onClick={() => setPaymentMethod('vnpay')}
                    className={`rounded-lg border p-2.5 text-center transition ${
                      paymentMethod === 'vnpay'
                        ? 'border-sky-500 bg-sky-50 text-sky-700 font-semibold'
                        : 'border-slate-200 bg-white/50 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    VNPay
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white/50 p-3.5 space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Seats locked:</span>
                  <span className="text-slate-900 font-medium">{selectedSeatsCount} seats</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total:</span>
                  <span className="text-indigo-600 font-bold text-sm">
                    {totalPrice.toLocaleString('vi-VN')} ₫
                  </span>
                </div>
              </div>

              <button
                disabled={isSubmitting}
                onClick={onConfirmBooking}
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
  );
}
