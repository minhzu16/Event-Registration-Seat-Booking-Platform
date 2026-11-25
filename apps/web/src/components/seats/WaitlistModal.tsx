'use client';

import React from 'react';
import { CheckCircle2, Users, X } from 'lucide-react';

export interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  waitlistSuccess: boolean;
  isSubmitting: boolean;
  onJoinWaitlist: () => void;
}

export function WaitlistModal({
  isOpen,
  onClose,
  waitlistSuccess,
  isSubmitting,
  onJoinWaitlist,
}: WaitlistModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl glass-strong border border-white/70 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            Join waiting list
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {waitlistSuccess ? (
          <div className="text-center py-3 space-y-2">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="text-xs font-semibold text-slate-900">Added to waiting list</p>
            <p className="text-xs text-slate-600">
              When a seat expires or is released, the scheduler automatically reserves a 24-hour hold offer for you.
            </p>
            <button
              onClick={onClose}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition mt-2"
            >
              Understood
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-slate-700 leading-relaxed">
              When seats become available via cancellations or expired holds, the system automatically allocates the next ticket to waiting attendees.
            </p>
            <button
              disabled={isSubmitting}
              onClick={onJoinWaitlist}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Confirm position in queue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
