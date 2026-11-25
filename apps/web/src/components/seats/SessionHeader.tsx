'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';

export interface SessionHeaderProps {
  eventTitle: string;
  sseConnected: boolean;
  secondsRemaining: number | null;
  onOpenCheckout: () => void;
}

export function SessionHeader({
  eventTitle,
  sseConnected,
  secondsRemaining,
  onOpenCheckout,
}: SessionHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4 mb-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition mb-1.5"
        >
          <ArrowLeft className="h-3 w-3" /> Back to events
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {eventTitle || 'Reserved seating map'}
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${
              sseConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-indigo-50 text-indigo-600 border-indigo-200'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                sseConnected ? 'bg-emerald-600' : 'bg-indigo-600'
              }`}
            />
            {sseConnected ? 'Live sync connected' : 'Connecting stream...'}
          </span>
        </div>
      </div>

      {/* Live Hold Timer HUD */}
      {secondsRemaining !== null && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`flex items-center gap-3 rounded-lg px-3.5 py-2 border transition-all ${
            secondsRemaining < 60
              ? 'border-red-200 bg-red-50 animate-pulse text-red-600 shadow-lg shadow-indigo-900/10'
              : 'border-indigo-200 glass'
          }`}
        >
          <Clock
            className={`h-4 w-4 ${
              secondsRemaining < 60
                ? 'text-red-600 animate-spin'
                : secondsRemaining < 180
                ? 'text-indigo-600 animate-pulse'
                : 'text-indigo-600'
            }`}
          />
          <div>
            <p
              className={`text-[10px] font-medium ${
                secondsRemaining < 60 ? 'text-red-600 font-bold' : 'text-indigo-600'
              }`}
            >
              {secondsRemaining < 60 ? 'Expiring soon!' : 'Hold active'}
            </p>
            <p className="text-base font-bold text-slate-900 font-mono leading-none">
              {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
            </p>
          </div>
          <button
            onClick={onOpenCheckout}
            className={`ml-2 rounded px-3 py-1.5 text-xs font-semibold transition ${
              secondsRemaining < 60
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
          >
            Confirm & pay
          </button>
        </div>
      )}
    </div>
  );
}
