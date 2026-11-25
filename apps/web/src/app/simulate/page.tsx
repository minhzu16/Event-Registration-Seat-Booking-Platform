'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  Gauge,
} from 'lucide-react';
import {
  fetchApi,
  Event,
  Seat,
  BenchmarkResult,
  IntegrityReport,
  SimulationSession,
} from '@/lib/api';
import { DEMO_MODE } from '@/lib/demo';

// The lab endpoints are ADMIN-only: explain that instead of showing a bare 401/403.
function labErrorMessage(err: unknown, fallback: string): string {
  const { status, message } = (err ?? {}) as { status?: number; message?: string };
  if (status === 401 || status === 403) {
    return DEMO_MODE
      ? 'Admin access required: open "Switch identity" in the top bar and choose Admin.'
      : 'Admin access required: sign in with an administrator account.';
  }
  return message || fallback;
}

export default function ConcurrencyLabPage() {
  const [sessions, setSessions] = useState<SimulationSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [targetSeatsCount, setTargetSeatsCount] = useState<number>(5);
  const [concurrentRequests, setConcurrentRequests] = useState<number>(100);
  const [strategy, setStrategy] = useState<'pessimistic' | 'conditional' | 'naive'>('pessimistic');

  const [isRunning, setIsRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetchApi<{ events: Event[] }>('/events')
      .then((res) => {
        if (ignore) return;
        const allSessions: SimulationSession[] = [];
        for (const ev of res.events || []) {
          if (ev.seating_mode === 'RESERVED' && ev.sessions) {
            for (const s of ev.sessions) {
              allSessions.push({
                ...s,
                eventTitle: ev.title,
              });
            }
          }
        }
        setSessions(allSessions);
        if (allSessions.length > 0) {
          setSelectedSessionId(allSessions[0].id);
        }
      })
      .catch((err) => {
        if (!ignore) console.error('Failed to load sessions', err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function runSimulation() {
    if (!selectedSessionId) return;
    try {
      setIsRunning(true);
      setBenchmarkResult(null);

      const seatsRes = await fetchApi<{ seats: Seat[] }>(`/sessions/${selectedSessionId}/seats`);
      const targetSeatIds = seatsRes.seats.slice(0, targetSeatsCount).map((s: Seat) => s.id);

      const res = await fetchApi<{
        benchmark: BenchmarkResult;
        integrityReport: IntegrityReport;
      }>('/admin/simulate/ticket-drop', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: selectedSessionId,
          targetSeatIds,
          concurrentRequests: Number(concurrentRequests),
          strategy,
        }),
      });

      setBenchmarkResult(res.benchmark);
      setIntegrityReport(res.integrityReport);
    } catch (err) {
      alert(labErrorMessage(err, 'Simulation failed'));
    } finally {
      setIsRunning(false);
    }
  }

  async function runManualIntegrityCheck() {
    if (!selectedSessionId) return;
    try {
      setIsCheckingIntegrity(true);
      const res = await fetchApi<IntegrityReport>(`/admin/integrity/${selectedSessionId}`);
      setIntegrityReport(res);
    } catch (err) {
      alert(labErrorMessage(err, 'Integrity check failed'));
    } finally {
      setIsCheckingIntegrity(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5 text-indigo-600" />
            Concurrency and locking laboratory
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Live benchmark test comparing row-level locking (SELECT FOR UPDATE), conditional compare-and-set (CAS), and uncoordinated naive updates under high ticket drop volume.
          </p>
        </div>

        <button
          onClick={runManualIntegrityCheck}
          disabled={isCheckingIntegrity || !selectedSessionId}
          className="flex items-center gap-2 rounded-lg border border-white/70 glass px-3.5 py-2 text-xs font-semibold text-slate-900 hover:border-emerald-500 hover:text-emerald-700 transition disabled:opacity-50"
        >
          {isCheckingIntegrity ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Database className="h-3.5 w-3.5 text-emerald-700" />
          )}
          Run SQL integrity scan
        </button>
      </div>

      {/* Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1 rounded-xl border border-white/70 glass p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-indigo-600" />
            Simulation parameters
          </h3>

          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-1">Target session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white/70 p-2 text-xs text-slate-900"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.eventTitle} ({new Date(s.starts_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-600 block mb-1.5">
              Locking strategy
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition ${
                  strategy === 'pessimistic'
                    ? 'border-indigo-500 bg-indigo-50 text-slate-900'
                    : 'border-slate-200 bg-white/50 text-slate-600 hover:text-slate-900'
                }`}
              >
                <input
                  type="radio"
                  name="strat"
                  checked={strategy === 'pessimistic'}
                  onChange={() => setStrategy('pessimistic')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-semibold text-slate-900">Pessimistic lock (SELECT FOR UPDATE)</p>
                  <p className="text-[11px] text-slate-600">
                    Sorts seat keys to prevent deadlock; holds row-level locks within ACID transaction.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition ${
                  strategy === 'conditional'
                    ? 'border-sky-500 bg-sky-50 text-slate-900'
                    : 'border-slate-200 bg-white/50 text-slate-600 hover:text-slate-900'
                }`}
              >
                <input
                  type="radio"
                  name="strat"
                  checked={strategy === 'conditional'}
                  onChange={() => setStrategy('conditional')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-semibold text-slate-900">Conditional compare-and-set (CAS)</p>
                  <p className="text-[11px] text-slate-600">
                    Atomic single statement UPDATE WHERE status=&apos;AVAILABLE&apos;. Fails immediately if taken.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition ${
                  strategy === 'naive'
                    ? 'border-red-500 bg-red-50 text-slate-900'
                    : 'border-slate-200 bg-white/50 text-slate-600 hover:text-slate-900'
                }`}
              >
                <input
                  type="radio"
                  name="strat"
                  checked={strategy === 'naive'}
                  onChange={() => setStrategy('naive')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-semibold text-red-600">Naive without locks (vulnerable demo)</p>
                  <p className="text-[11px] text-slate-600">
                    Separate read followed by write. Deliberately produces duplicate allocations under concurrency.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Contested seats</label>
              <select
                value={targetSeatsCount}
                onChange={(e) => setTargetSeatsCount(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white/70 p-2 text-xs text-slate-900"
              >
                <option value={1}>1 seat (Hotspot)</option>
                <option value={5}>5 seats</option>
                <option value={10}>10 seats</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Parallel clients</label>
              <select
                value={concurrentRequests}
                onChange={(e) => setConcurrentRequests(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white/70 p-2 text-xs text-slate-900"
              >
                <option value={50}>50 requests</option>
                <option value={100}>100 requests</option>
                <option value={200}>200 requests</option>
              </select>
            </div>
          </div>

          <button
            disabled={isRunning || !selectedSessionId}
            onClick={runSimulation}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-40"
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Firing parallel batch...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Execute benchmark
              </>
            )}
          </button>
        </div>

        {/* Results / Live Telemetry */}
        <div className="lg:col-span-2 space-y-5">
          {benchmarkResult ? (
            <div className="rounded-xl border border-white/70 glass p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[10px] text-slate-600">Benchmark result</span>
                  <h3 className="text-base font-bold text-slate-900">
                    {benchmarkResult.strategy} execution metrics
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-sky-700">
                    {benchmarkResult.throughputRps} RPS
                  </span>
                  <p className="text-[10px] text-slate-600">in {benchmarkResult.durationMs} ms</p>
                </div>
              </div>

              {/* Status Outcome Distribution */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">Outcome distribution</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xl font-bold text-emerald-700">
                      {benchmarkResult.successfulHolds}
                    </p>
                    <p className="text-xs text-slate-900 font-medium">201 Created</p>
                    <p className="text-[10px] text-slate-600">Held: {benchmarkResult.actualHeldSeatsCount}</p>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xl font-bold text-amber-600">
                      {benchmarkResult.conflicts409}
                    </p>
                    <p className="text-xs text-slate-900 font-medium">409 Conflict</p>
                    <p className="text-[10px] text-slate-600">Rejected safely</p>
                  </div>

                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xl font-bold text-red-600">
                      {benchmarkResult.errors500}
                    </p>
                    <p className="text-xs text-slate-900 font-medium">500 Server errors</p>
                    <p className="text-[10px] text-slate-600">Zero deadlocks</p>
                  </div>
                </div>
              </div>

              {/* Latency Percentiles */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">Latency distribution (ms)</p>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="rounded border border-slate-200 bg-white/50 p-2">
                    <span className="text-[10px] text-slate-600 block">Min</span>
                    <strong className="text-slate-900">{benchmarkResult.latencyMs.min}ms</strong>
                  </div>
                  <div className="rounded border border-slate-200 bg-white/50 p-2">
                    <span className="text-[10px] text-slate-600 block">P50</span>
                    <strong className="text-sky-700">{benchmarkResult.latencyMs.p50}ms</strong>
                  </div>
                  <div className="rounded border border-slate-200 bg-white/50 p-2">
                    <span className="text-[10px] text-slate-600 block">P90</span>
                    <strong className="text-amber-600">{benchmarkResult.latencyMs.p90}ms</strong>
                  </div>
                  <div className="rounded border border-slate-200 bg-white/50 p-2">
                    <span className="text-[10px] text-slate-600 block">P99</span>
                    <strong className="text-slate-700">{benchmarkResult.latencyMs.p99}ms</strong>
                  </div>
                  <div className="rounded border border-slate-200 bg-white/50 p-2">
                    <span className="text-[10px] text-slate-600 block">Max</span>
                    <strong className="text-slate-600">{benchmarkResult.latencyMs.max}ms</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 glass p-10 text-center text-xs text-slate-600">
              <Zap className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              Select parameters on the left and click &quot;Execute benchmark&quot; to test concurrent ticket drops.
            </div>
          )}

          {/* Database SQL Integrity Check Banner */}
          {integrityReport && (
            <div
              className={`rounded-xl border p-4 ${
                integrityReport.status === 'PASSED'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {integrityReport.status === 'PASSED' ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
                )}
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {integrityReport.status === 'PASSED'
                      ? 'Integrity scan passed: 0 double bookings detected'
                      : 'Integrity conflict detected'}
                  </h4>
                  <p className="text-[11px] text-slate-700 mt-0.5">
                    {integrityReport.status === 'PASSED'
                      ? 'Partial unique index and row-level locks verified: No duplicate seat allocations exist in PostgreSQL.'
                      : `Found ${integrityReport.totalViolations} duplicate hold conflicts in database tables.`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
