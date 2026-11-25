import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Booking } from '@/lib/api';

interface CancelBookingModalProps {
  booking: Booking;
  isCancelling: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function CancelBookingModal({
  booking,
  isCancelling,
  onConfirm,
  onClose,
}: CancelBookingModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/70 glass-strong p-5 shadow-xl shadow-indigo-900/10">
        <div className="flex items-center gap-2 text-indigo-600 mb-3">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="text-sm font-bold text-slate-900">Cancel booking confirmation</h3>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed">
          Are you sure you want to cancel booking{' '}
          <strong className="text-slate-900">{booking.reference}</strong>?
          Seats will be released immediately to waitlist attendees or live inventory.
        </p>

        <div className="mt-5 flex gap-2.5">
          <button
            disabled={isCancelling}
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-rose-600 py-2.5 text-xs font-semibold text-white hover:bg-rose-500 transition disabled:opacity-50"
          >
            {isCancelling ? 'Processing...' : 'Confirm cancellation'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-700 hover:text-slate-900 transition"
          >
            Keep booking
          </button>
        </div>
      </div>
    </div>
  );
}
