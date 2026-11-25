'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Plus, Grid, Download } from 'lucide-react';
import { fetchApi, Event, API_BASE, AttendanceReport } from '@/lib/api';
import { AttendanceAnalytics } from '@/components/organiser/AttendanceAnalytics';
import { CreateEventModal } from '@/components/organiser/CreateEventModal';
import { SeatMapBuilderModal } from '@/components/organiser/SeatMapBuilderModal';

export default function OrganiserStudioPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [seatMapBuilderOpen, setSeatMapBuilderOpen] = useState(false);

  async function loadSessionReport(sessId: string) {
    try {
      const res = await fetchApi<AttendanceReport>(`/organiser/sessions/${sessId}/reports/attendance`);
      setReport(res);
    } catch (err) {
      console.error('Failed to load report', err);
    }
  }

  async function loadEvents() {
    try {
      setLoading(true);
      const res = await fetchApi<{ events: Event[] }>('/events');
      setEvents(res.events || []);
      if (res.events && res.events.length > 0 && res.events[0].sessions && res.events[0].sessions.length > 0) {
        const sessId = res.events[0].sessions[0].id;
        setSelectedSessionId(sessId);
        await loadSessionReport(sessId);
      }
    } catch (err) {
      console.error('Failed to load events', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    fetchApi<{ events: Event[] }>('/events')
      .then((res) => {
        if (ignore) return;
        const evList = res.events || [];
        setEvents(evList);
        if (evList.length > 0 && evList[0].sessions && evList[0].sessions.length > 0) {
          const sessId = evList[0].sessions[0].id;
          setSelectedSessionId(sessId);
          void loadSessionReport(sessId);
        }
      })
      .catch((err) => {
        if (!ignore) console.error('Failed to load events', err);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  function downloadCsv() {
    if (!selectedSessionId) return;
    const token = localStorage.getItem('token') || '';
    window.open(`${API_BASE}/organiser/sessions/${selectedSessionId}/attendees?format=csv&token=${token}`, '_blank');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-600" />
            Organiser Studio
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Manage events, build grid seating layouts, monitor live attendance, and export reports.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreateEventOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition"
          >
            <Plus className="h-4 w-4" /> Create New Event
          </button>
        </div>
      </div>

      {/* Main Studio Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Events & Sessions List */}
        <div className="space-y-6">
          <div className="rounded-3xl glass border border-white/70 p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">Your Events Inventory</h3>

            {loading ? (
              <p className="text-xs text-slate-500">Loading events...</p>
            ) : (
              <div className="space-y-3">
                {events.map((ev) => {
                  const firstSession = ev.sessions?.[0];
                  const isSelected = firstSession && firstSession.id === selectedSessionId;

                  return (
                    <div
                      key={ev.id}
                      onClick={() => {
                        if (firstSession) {
                          setSelectedSessionId(firstSession.id);
                          loadSessionReport(firstSession.id);
                        }
                      }}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-slate-900 shadow-md'
                          : 'border-slate-200 bg-white/50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                          {ev.category} • {ev.seating_mode}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">v{ev.version}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 truncate">{ev.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{ev.venue_name}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedSessionId && (
              <div className="mt-6 border-t border-slate-200 pt-4 space-y-2">
                <button
                  onClick={() => setSeatMapBuilderOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition"
                >
                  <Grid className="h-4 w-4" /> Open Grid Seat Builder
                </button>
                <button
                  onClick={downloadCsv}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/50 py-2.5 text-xs font-semibold text-slate-700 hover:bg-white/80 transition"
                >
                  <Download className="h-4 w-4 text-sky-700" /> Export Attendees (CSV)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Attendance Analytics */}
        <div className="lg:col-span-2 space-y-6">
          <AttendanceAnalytics report={report} />
        </div>
      </div>

      {createEventOpen && (
        <CreateEventModal
          onClose={() => setCreateEventOpen(false)}
          onCreated={loadEvents}
        />
      )}

      {seatMapBuilderOpen && (
        <SeatMapBuilderModal
          selectedSessionId={selectedSessionId}
          onClose={() => setSeatMapBuilderOpen(false)}
          onBuilt={loadSessionReport}
        />
      )}
    </div>
  );
}
