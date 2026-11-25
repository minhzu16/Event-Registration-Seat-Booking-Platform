'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Users,
  Grid,
  Download,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  fetchApi,
  Event,
  API_BASE,
  AttendanceReport,
  SessionSeatMapResponse,
} from '@/lib/api';

export default function OrganiserStudioPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [seatMapBuilderOpen, setSeatMapBuilderOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Event Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Technology');
  const [venueName, setVenueName] = useState('Grand Hall');
  const [seatingMode, setSeatingMode] = useState<'GA' | 'RESERVED'>('RESERVED');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  // Seat Map Builder State
  const [secName, setSecName] = useState('Main Orchestra');
  const [rowsCount, setRowsCount] = useState(4);
  const [seatsPerRow, setSeatsPerRow] = useState(10);
  const [ticketTypeId, setTicketTypeId] = useState('');

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

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const defaultStarts = startsAt || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const defaultEnds = endsAt || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 4 * 3600 * 1000).toISOString();

      await fetchApi('/organiser/events', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          category,
          venueName,
          seatingMode,
          cancelDeadlineHours: 24,
          refundPercent: 100,
          maxTicketsPerUser: 4,
          sessions: [
            {
              startsAt: defaultStarts,
              endsAt: defaultEnds,
              ticketTypes: [
                {
                  name: seatingMode === 'RESERVED' ? 'Premium Tier' : 'General Admission',
                  price: 500000,
                  capacity: 100,
                  color: '#6366f1',
                },
              ],
            },
          ],
        }),
      });

      setCreateEventOpen(false);
      loadEvents();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBuildSeatMap(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSessionId) return;

    try {
      setIsSubmitting(true);
      // Fetch ticket types for this session
      const seatRes = await fetchApi<SessionSeatMapResponse>(`/sessions/${selectedSessionId}/seats`);
      const targetTypeId = seatRes.ticketTypes?.[0]?.id || ticketTypeId;

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
      setSeatMapBuilderOpen(false);
      loadSessionReport(selectedSessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || 'Failed to generate seat map');
    } finally {
      setIsSubmitting(false);
    }
  }

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
          {report ? (
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
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white/40 p-12 text-center text-xs text-slate-600">
              Select an event session on the left to view attendance metrics.
            </div>
          )}
        </div>
      </div>

      {/* Create Event Modal */}
      {createEventOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl glass-strong border border-white/70 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
              <h3 className="text-lg font-bold text-slate-900">Create New Event</h3>
              <button onClick={() => setCreateEventOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AI Concurrency Conference 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2.5 text-slate-900 placeholder-slate-400"
                />
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Venue Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grand Auditorium Hall A"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white/70 px-3.5 py-2.5 text-slate-900 placeholder-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-slate-900"
                  >
                    <option value="Technology">Technology</option>
                    <option value="Music">Music</option>
                    <option value="Business">Business</option>
                    <option value="Art">Art</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Seating Mode</label>
                  <select
                    value={seatingMode}
                    onChange={(e) => setSeatingMode(e.target.value as 'GA' | 'RESERVED')}
                    className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-slate-900"
                  >
                    <option value="RESERVED">Reserved Seating (Grid)</option>
                    <option value="GA">General Admission</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50 mt-4"
              >
                {isSubmitting ? 'Publishing Event...' : 'Create & Publish Event'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Grid Seat Map Builder Modal */}
      {seatMapBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl glass-strong border border-white/70 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Grid className="h-4 w-4 text-indigo-600" />
                Build Grid Seating Plan
              </h3>
              <button
                onClick={() => setSeatMapBuilderOpen(false)}
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
      )}
    </div>
  );
}
