import React from 'react';
import {
  Calendar,
  MapPin,
  CheckCircle2,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import { Booking } from '@/lib/api';

interface BookingCardProps {
  booking: Booking;
  onCancelClick: (booking: Booking) => void;
  onOpenRollingPass: (ticketId: string, attendeeName: string, tierName: string, seatInfo?: string) => void;
}

export function BookingCard({
  booking,
  onCancelClick,
  onOpenRollingPass,
}: BookingCardProps) {
  const isCancelled = booking.status === 'CANCELLED';
  const startsAt = new Date(booking.starts_at).toLocaleDateString('vi-VN', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        isCancelled
          ? 'border-white/50 glass opacity-60'
          : 'border-white/70 glass'
      } transition`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 bg-white/50 p-4 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-indigo-600">
              {booking.reference}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                isCancelled
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {booking.status}
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mt-1">{booking.event_title}</h3>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div>
            <p className="text-[10px] text-slate-600">Paid amount</p>
            <p className="font-semibold text-slate-900">
              {Number(booking.total_amount).toLocaleString('vi-VN')} ₫
            </p>
          </div>

          {!isCancelled && (
            <button
              onClick={() => onCancelClick(booking)}
              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition"
            >
              Cancel reservation
            </button>
          )}
        </div>
      </div>

      {/* Sub details */}
      <div className="flex flex-wrap gap-4 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-600 bg-white/30">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-indigo-600" />
          <span>{startsAt}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-500" />
          <span>{booking.venue_name}</span>
        </div>
      </div>

      {/* Issued Tickets */}
      <div className="p-4">
        <p className="text-xs font-medium text-slate-600 mb-3">
          Issued tickets ({booking.tickets?.length || 0})
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {booking.tickets?.map((t) => {
            const isCheckedIn = Boolean(t.checkedInAt);

            return (
              <div
                key={t.id}
                className="flex flex-col sm:flex-row items-center gap-3.5 rounded-lg border border-white/70 glass p-3.5"
              >
                {/* QR Code image */}
                <div className="flex flex-col items-center shrink-0 bg-white p-2 rounded-md shadow-sm">
                  {t.qrDataUrl ? (
                    <img
                      src={t.qrDataUrl}
                      alt="Pass QR"
                      className="h-24 w-24 object-contain"
                    />
                  ) : (
                    <QrCode className="h-24 w-24 text-slate-900" />
                  )}
                  <span className="text-[9px] font-mono text-slate-600 mt-1 max-w-[95px] truncate">
                    {t.code.substring(0, 14)}...
                  </span>
                </div>

                {/* Ticket Meta */}
                <div className="flex-1 space-y-1 text-center sm:text-left">
                  <p className="text-xs font-bold text-slate-900">{t.attendeeName}</p>
                  <p className="text-xs text-indigo-600 font-medium">{t.ticketTypeName}</p>

                  {t.seatSection ? (
                    <p className="text-xs text-slate-700 font-mono">
                      {t.seatSection} • Row {t.seatRow}-{t.seatNumber}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600">General admission</p>
                  )}

                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    {isCheckedIn ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Checked in
                      </span>
                    ) : isCancelled ? (
                      <span className="text-[11px] text-red-600">Cancelled pass</span>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            const seatLabel = t.seatSection
                              ? `${t.seatSection} • Row ${t.seatRow}-${t.seatNumber}`
                              : 'General Admission';
                            onOpenRollingPass(t.id, t.attendeeName, t.ticketTypeName, seatLabel);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 hover:border-sky-300 transition shadow-sm"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-sky-700" />
                          SafeTix™ Live Pass
                        </button>
                        <span className="text-[10px] text-slate-500 hidden sm:inline">Rolling code</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
