'use client';

import React from 'react';
import { Clock, CreditCard, RefreshCw, X } from 'lucide-react';
import { Seat } from '@/lib/api';

export interface HoldPanelProps {
  selectedSeats: Seat[];
  totalPrice: number;
  activeHoldId: string | null;
  isSubmitting: boolean;
  onSuggestSeats: (qty: number) => void;
  onToggleSeatSelection: (seat: Seat) => void;
  onCreateHold: () => void;
  onOpenCheckout: () => void;
  onReleaseHold: () => void;
  onOpenWaitlist: () => void;
}

export function HoldPanel({
  selectedSeats,
  totalPrice,
  activeHoldId,
  isSubmitting,
  onSuggestSeats,
  onToggleSeatSelection,
  onCreateHold,
  onOpenCheckout,
  onReleaseHold,
  onOpenWaitlist,
}: HoldPanelProps) {
  return (
    <div className="flex flex-col justify-between rounded-xl glass border border-white/70 p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          Seat reservation
        </h3>

        {/* Adjacent seat quick picker */}
        {!activeHoldId && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-white/50 p-3">
            <span className="text-[11px] font-medium text-slate-700 block mb-2">
              Auto-find adjacent seats
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => onSuggestSeats(2)}
                className="rounded border border-slate-200 bg-white/50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 transition"
              >
                2 seats
              </button>
              <button
                onClick={() => onSuggestSeats(3)}
                className="rounded border border-slate-200 bg-white/50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 transition"
              >
                3 seats
              </button>
              <button
                onClick={() => onSuggestSeats(4)}
                className="rounded border border-slate-200 bg-white/50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 transition"
              >
                4 seats
              </button>
            </div>
          </div>
        )}

        {selectedSeats.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-xs text-slate-600">
            Click any available seat on the map or pick adjacent seats above.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {selectedSeats.map((seat) => (
              <div
                key={seat.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/50 p-2.5 text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {seat.section} • Row {seat.rowLabel}-{seat.seatNumber}
                  </p>
                  <p className="text-[11px] text-slate-600">{seat.tierName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-indigo-600">
                    {seat.price.toLocaleString('vi-VN')} ₫
                  </span>
                  {!activeHoldId && (
                    <button
                      type="button"
                      onClick={() => onToggleSeatSelection(seat)}
                      aria-label={`Bỏ chọn ghế ${seat.rowLabel}-${seat.seatNumber}`}
                      className="text-slate-500 hover:text-red-600 p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Price breakdown */}
        <div className="mt-5 border-t border-slate-200 pt-3.5 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Tickets ({selectedSeats.length})</span>
            <span>{totalPrice.toLocaleString('vi-VN')} ₫</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Processing fee</span>
            <span className="text-emerald-700 font-medium">0 ₫</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2">
            <span>Total amount</span>
            <span className="text-indigo-600">{totalPrice.toLocaleString('vi-VN')} ₫</span>
          </div>
        </div>
      </div>

      {/* Action Area */}
      <div className="mt-6 space-y-2.5">
        {!activeHoldId ? (
          <button
            disabled={selectedSeats.length === 0 || isSubmitting}
            onClick={onCreateHold}
            className="w-full rounded-lg bg-indigo-600 py-3 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              onClick={onOpenCheckout}
              className="w-full rounded-lg bg-emerald-600 py-3 text-xs font-semibold text-white hover:bg-emerald-500 transition flex items-center justify-center gap-2"
            >
              <CreditCard className="h-3.5 w-3.5" /> Confirm and pay
            </button>
            <button
              onClick={onReleaseHold}
              className="w-full rounded-lg border border-slate-200 bg-white/50 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition"
            >
              Release hold
            </button>
          </div>
        )}

        {/* Waiting list */}
        <button
          onClick={onOpenWaitlist}
          className="w-full text-center text-xs text-slate-600 hover:text-indigo-600 transition py-1"
        >
          Seats full? <span className="underline">Join waiting list</span>
        </button>
      </div>
    </div>
  );
}
