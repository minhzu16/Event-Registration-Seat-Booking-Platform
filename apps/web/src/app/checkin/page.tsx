'use client';

import React, { useState, useEffect } from 'react';
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  User,
  MapPin,
  RefreshCw,
  QrCode,
  ShieldAlert,
} from 'lucide-react';
import { fetchApi, Booking } from '@/lib/api';

export default function CheckinScannerPage() {
  const [ticketCode, setTicketCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [sampleTickets, setSampleTickets] = useState<any[]>([]);

  useEffect(() => {
    loadSampleTickets();
  }, []);

  async function loadSampleTickets() {
    try {
      const res = await fetchApi<{ bookings: Booking[] }>('/me/bookings');
      const tickets: any[] = [];
      for (const b of res.bookings || []) {
        for (const t of b.tickets || []) {
          tickets.push({
            ...t,
            eventTitle: b.event_title,
          });
        }
      }
      setSampleTickets(tickets);
    } catch {
      // ignore
    }
  }

  async function handleScanSubmit(e?: React.FormEvent, customCode?: string) {
    if (e) e.preventDefault();
    const codeToScan = customCode || ticketCode;
    if (!codeToScan.trim()) return;

    try {
      setIsSubmitting(true);
      setScanResult(null);

      const res = await fetchApi('/checkin/scan', {
        method: 'POST',
        body: JSON.stringify({ code: codeToScan.trim() }),
      });

      setScanResult(res);
      setRecentScans((prev) => [
        {
          code: codeToScan,
          result: res.result,
          attendee: res.attendee,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 15),
      ]);
      setTicketCode('');
    } catch (err: any) {
      const resultObj = {
        result: err.data?.result || 'INVALID',
        message: err.message || 'Verification failed',
        attendee: err.data?.attendee,
      };
      setScanResult(resultObj);
      setRecentScans((prev) => [
        {
          code: codeToScan,
          result: resultObj.result,
          message: resultObj.message,
          attendee: resultObj.attendee,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 15),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-cyan-400" />
            Gate Check-in Scanner
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time atomic scanner enforcing HMAC cryptographic signature & anti-duplicate check-in.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Input / Scanner Simulator */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-cyan-400" />
              Scan or Enter Ticket Code
            </h3>

            <form onSubmit={handleScanSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-semibold">
                  HMAC Cryptographic Pass Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. NGIxNGQ3M2Et...xZ195... (or paste from QR)"
                  value={ticketCode}
                  onChange={(e) => setTicketCode(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs text-white font-mono placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !ticketCode.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-cyan-600/30 hover:from-cyan-500 hover:to-indigo-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <ScanLine className="h-4 w-4" /> Verify & Check-in Pass
                  </>
                )}
              </button>
            </form>

            {/* Quick Test Helper */}
            {sampleTickets.length > 0 && (
              <div className="mt-6 border-t border-white/5 pt-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  1-Click Quick Scan from Your Booked Tickets:
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {sampleTickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleScanSubmit(undefined, t.code)}
                      className="w-full text-left rounded-lg border border-white/10 bg-slate-800/40 p-2 text-[11px] text-slate-300 hover:bg-cyan-950/40 hover:border-cyan-500/30 hover:text-white transition flex justify-between items-center"
                    >
                      <span className="font-semibold truncate max-w-[170px]">{t.attendeeName}</span>
                      <span className="font-mono text-cyan-400 text-[10px]">Quick Scan →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Scan Feedback Display */}
        <div className="space-y-6">
          {scanResult ? (
            <div
              className={`rounded-3xl border p-6 backdrop-blur-xl shadow-2xl transition duration-300 ${
                scanResult.result === 'OK'
                  ? 'border-emerald-500/50 bg-emerald-950/40 glow-success'
                  : scanResult.result === 'ALREADY_CHECKED_IN'
                  ? 'border-amber-500/50 bg-amber-950/40'
                  : 'border-rose-500/50 bg-rose-950/40'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                {scanResult.result === 'OK' ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                ) : scanResult.result === 'ALREADY_CHECKED_IN' ? (
                  <AlertCircle className="h-8 w-8 text-amber-400" />
                ) : (
                  <XCircle className="h-8 w-8 text-rose-400" />
                )}
                <div>
                  <h3 className="text-lg font-black text-white">
                    {scanResult.result === 'OK'
                      ? 'CHECK-IN APPROVED'
                      : scanResult.result === 'ALREADY_CHECKED_IN'
                      ? 'DUPLICATE SCAN DETECTED'
                      : 'CHECK-IN REJECTED'}
                  </h3>
                  <p className="text-xs text-slate-300">{scanResult.message}</p>
                </div>
              </div>

              {scanResult.attendee && (
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Attendee:</span>
                    <span className="font-bold text-white">{scanResult.attendee.attendee_name}</span>
                  </div>
                  {scanResult.attendee.section && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Seating:</span>
                      <span className="font-bold text-cyan-300">
                        {scanResult.attendee.section} — Row {scanResult.attendee.row_label}, Seat{' '}
                        {scanResult.attendee.seat_number}
                      </span>
                    </div>
                  )}
                  {scanResult.attendee.checked_in_at && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Time:</span>
                      <span className="font-mono text-slate-300">
                        {new Date(scanResult.attendee.checked_in_at).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/30 p-12 text-center text-xs text-slate-400 backdrop-blur-md">
              <ScanLine className="mx-auto h-12 w-12 text-slate-600 mb-3" />
              Scan a pass to view attendee verification details.
            </div>
          )}

          {/* Recent Scans Feed */}
          {recentScans.length > 0 && (
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-md">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                Recent Scans Log
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {recentScans.map((scan, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/40 p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          scan.result === 'OK'
                            ? 'bg-emerald-400'
                            : scan.result === 'ALREADY_CHECKED_IN'
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        }`}
                      />
                      <span className="font-semibold text-white">
                        {scan.attendee?.attendee_name || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-slate-400">{scan.timestamp}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          scan.result === 'OK'
                            ? 'bg-emerald-950 text-emerald-400'
                            : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        {scan.result}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
