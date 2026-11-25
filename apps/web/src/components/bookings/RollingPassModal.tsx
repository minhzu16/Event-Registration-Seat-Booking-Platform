import React from 'react';
import { ShieldCheck, Clock, X } from 'lucide-react';

export interface RollingTicketState {
  id: string;
  attendeeName: string;
  tierName: string;
  seatInfo?: string;
  rollingCode: string;
  qrDataUrl: string;
  remainingSeconds: number;
}

interface RollingPassModalProps {
  ticket: RollingTicketState;
  onClose: () => void;
}

export function RollingPassModal({ ticket, onClose }: RollingPassModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/70 glass-strong p-6 shadow-xl shadow-indigo-900/10 text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header Badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 tracking-wide uppercase shadow-inner mb-3">
          <ShieldCheck className="h-3.5 w-3.5 text-sky-700 animate-pulse" />
          SafeTix™ Verified Pass
        </div>

        <h3 className="text-base font-bold text-slate-900">{ticket.attendeeName}</h3>
        <p className="text-xs text-indigo-600 font-medium">{ticket.tierName}</p>
        {ticket.seatInfo && (
          <p className="text-xs text-slate-600 font-mono mt-0.5">{ticket.seatInfo}</p>
        )}

        {/* Interactive QR Display with Scanline */}
        <div className="relative mx-auto my-5 flex h-60 w-60 items-center justify-center rounded-2xl border-2 border-sky-200 bg-white p-3 shadow-lg shadow-indigo-900/10 overflow-hidden">
          {/* Scanline Animation */}
          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-500 to-transparent animate-bounce opacity-80 pointer-events-none" />

          {ticket.qrDataUrl ? (
            <img
              src={ticket.qrDataUrl}
              alt="Dynamic SafeTix Pass"
              className="h-full w-full object-contain select-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            </div>
          )}
        </div>

        {/* Circular Progress Countdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600 px-2 font-mono">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-sky-700" /> Rotating barcode
            </span>
            <span className="font-bold text-sky-700">
              Refreshes in {ticket.remainingSeconds}s
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-1000 ease-linear"
              style={{ width: `${(ticket.remainingSeconds / 15) * 100}%` }}
            />
          </div>
        </div>

        {/* Fraud & Screenshot Warning */}
        <div className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 text-[11px] text-indigo-700 leading-snug">
          ⚡ <strong>Anti-Screenshot Protection:</strong> This QR code regenerates cryptographically every 15 seconds. Screenshots will be rejected at the gate scanner.
        </div>
      </div>
    </div>
  );
}
