'use client';

import React, { useState } from 'react';
import { Grid, X } from 'lucide-react';
import { fetchApi, SessionSeatMapResponse } from '@/lib/api';

interface SeatMapBuilderModalProps {
  selectedSessionId: string;
  onClose: () => void;
  onBuilt: (sessionId: string) => void;
}

export function SeatMapBuilderModal({ selectedSessionId, onClose, onBuilt }: SeatMapBuilderModalProps) {
  const [secName, setSecName] = useState('Main Orchestra');
  const [rowsCount, setRowsCount] = useState(4);
  const [seatsPerRow, setSeatsPerRow] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleBuildSeatMap(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSessionId) return;

    try {
      setIsSubmitting(true);
      // Fetch ticket types for this session
      const seatRes = await fetchApi<SessionSeatMapResponse>(`/sessions/${selectedSessionId}/seats`);
      const targetTypeId = seatRes.ticketTypes?.[0]?.id || '';

      await fetchApi(`/organiser/sessions/${selectedSessionId}/seatmap`, {
        method: 'POST',
        body: JSON.stringify({
          sections: [
            {
              name: secName,
              ticketTypeId: targetTypeId,
              rows: Number(rowsCount),
              seatsPerRow: Number(seatsPerRow),
              startX: 50,
              startY: 60,
            },
          ],
        }),
      });

      alert('Grid seat map built and synced successfully!');
      onClose();
      onBuilt(selectedSessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to generate seat map');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl glass-strong border border-white/70 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Grid className="h-4 w-4 text-indigo-600" />
            Build Grid Seating Plan
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleBuildSeatMap} className="space-y-4 text-xs">
          <div>
            <label className="text-slate-700 font-semibold block mb-1">Section Name</label>
            <input
              type="text"
              required
              value={secName}
              onChange={(e) => setSecName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2.5 text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-700 font-semibold block mb-1">Rows (A, B, C...)</label>
              <input
                type="number"
                min="1"
                max="20"
                value={rowsCount}
                onChange={(e) => setRowsCount(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 font-semibold block mb-1">Seats Per Row</label>
              <input
                type="number"
                min="1"
                max="25"
                value={seatsPerRow}
                onChange={(e) => setSeatsPerRow(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-slate-900"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/50 p-3 text-slate-600">
            Total seats generated: <strong className="text-slate-900">{rowsCount * seatsPerRow}</strong>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-sky-400 transition disabled:opacity-50"
          >
            {isSubmitting ? 'Generating Seats...' : 'Generate & Sync Seats to DB'}
          </button>
        </form>
      </div>
    </div>
  );
}
