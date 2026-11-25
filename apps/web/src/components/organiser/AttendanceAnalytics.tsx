import React from 'react';
import { Users, TrendingUp, DollarSign, CheckCircle2 } from 'lucide-react';
import { AttendanceReport } from '@/lib/api';

interface AttendanceAnalyticsProps {
  report: AttendanceReport | null;
}

export function AttendanceAnalytics({ report }: AttendanceAnalyticsProps) {
  if (!report) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/40 p-12 text-center text-xs text-slate-600">
        Select an event session on the left to view attendance metrics.
      </div>
    );
  }

  return (
    <>
      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl glass border border-white/70 p-4">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold">Total Issued</span>
          </div>
          <p className="text-2xl font-black text-slate-900">{report.summary.totalTickets}</p>
          <p className="text-[11px] text-slate-600">Paid & Active Passes</p>
        </div>

        <div className="rounded-2xl glass border border-white/70 p-4">
          <div className="flex items-center gap-2 text-emerald-700 mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-semibold">Checked In</span>
          </div>
          <p className="text-2xl font-black text-emerald-700">{report.summary.checkedIn}</p>
          <p className="text-[11px] text-slate-600">{report.summary.fillRatePercent}% Fill Rate</p>
        </div>

        <div className="rounded-2xl glass border border-white/70 p-4">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-semibold">No-Shows</span>
          </div>
          <p className="text-2xl font-black text-indigo-600">{report.summary.noShows}</p>
          <p className="text-[11px] text-slate-600">Pending Entrance</p>
        </div>

        <div className="rounded-2xl glass border border-white/70 p-4">
          <div className="flex items-center gap-2 text-sky-700 mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-semibold">Gross Revenue</span>
          </div>
          <p className="text-xl font-black text-sky-700">
            {Number(report.summary.totalRevenue).toLocaleString('vi-VN')} ₫
          </p>
          <p className="text-[11px] text-slate-600">Total Bookings</p>
        </div>
      </div>

      {/* Tier breakdown */}
      <div className="rounded-3xl glass border border-white/70 p-6 shadow-xl">
        <h3 className="text-base font-bold text-slate-900 mb-4">Breakdown by Ticket Tier</h3>
        <div className="space-y-3">
          {report.tierBreakdown?.map((tier) => {
            const sold = Number(tier.tickets_sold || 0);
            const checkIn = Number(tier.checked_in || 0);
            const percent = sold > 0 ? Math.round((checkIn / sold) * 100) : 0;

            return (
              <div key={tier.name} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-900">{tier.name}</span>
                  <span className="text-slate-600">
                    {checkIn} / {sold} Checked in ({percent}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
