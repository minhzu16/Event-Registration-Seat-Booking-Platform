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
import { fetchApi, Event } from '@/lib/api';

export default function ConcurrencyLabPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [targetSeatsCount, setTargetSeatsCount] = useState<number>(5);
  const [concurrentRequests, setConcurrentRequests] = useState<number>(100);
  const [strategy, setStrategy] = useState<'pessimistic' | 'conditional' | 'naive'>('pessimistic');

  const [isRunning, setIsRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [integrityReport, setIntegrityReport] = useState<any | null>(null);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res = await fetchApi<{ events: Event[] }>('/events');
      const allSessions: any[] = [];
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
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  }

  async function runSimulation() {
    if (!selectedSessionId) return;
    try {
      setIsRunning(true);
      setBenchmarkResult(null);

      const seatsRes = await fetchApi(`/sessions/${selectedSessionId}/seats`);
      const targetSeatIds = seatsRes.seats.slice(0, targetSeatsCount).map((s: any) => s.id);

      const res = await fetchApi('/admin/simulate/ticket-drop', {
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
    } catch (err: any) {
      alert(err.message || 'Simulation failed');
    } finally {
      setIsRunning(false);
    }
  }

  async function runManualIntegrityCheck() {
    if (!selectedSessionId) return;
    try {
      setIsCheckingIntegrity(true);
      const res = await fetchApi(`/admin/integrity/${selectedSessionId}`);
      setIntegrityReport(res);
    } catch (err: any) {
      alert(err.message || 'Integrity check failed');
    } finally {
      setIsCheckingIntegrity(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-5 mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Concurrency and locking laboratory
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Live benchmark test comparing row-level locking (SELECT FOR UPDATE), conditional compare-and-set (CAS), and uncoordinated naive updates under high ticket drop volume.
          </p>
        </div>

        <button
          onClick={runManualIntegrityCheck}
          disabled={isCheckingIntegrity || !selectedSessionId}
          className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#0c101a] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-500/50 hover:text-emerald-400 transition disabled:opacity-50"
        >
          {isCheckingIntegrity ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Database className="h-3.5 w-3.5 text-emerald-400" />
          )}
          Run SQL integrity scan
        </button>
      </div>

      {/* Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1 rounded-xl border border-white/[0.08] bg-[#0c101a] p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-amber-400" />
            Simulation parameters
          </h3>

          <div>
            <label className="text-[11px] font-medium text-slate-400 block mb-1">Target session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-[#121824] p-2 text-xs text-white"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.eventTitle} ({new Date(s.starts_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-400 block mb-1.5">
              Locking strategy
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition ${
                  strategy === 'pessimistic'
                    ? 'border-amber-400/50 bg-[#162032] text-white'
                    : 'border-white/[0.06] bg-[#121824] text-slate-400 hover:text-white'
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
                  <p className="font-semibold text-white">Pessimistic lock (SELECT FOR UPDATE)</p>
                  <p className="text-[11px] text-slate-400">
                    Sorts seat keys to prevent deadlock; holds row-level locks within ACID transaction.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition ${
                  strategy === 'conditional'
                    ? 'border-cyan-400/50 bg-[#162032] text-white'
                    : 'border-white/[0.06] bg-[#121824] text-slate-400 hover:text-white'
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
                  <p className="font-semibold text-white">Conditional compare-and-set (CAS)</p>
                  <p className="text-[11px] text-slate-400">
                    Atomic single statement UPDATE WHERE status=&apos;AVAILABLE&apos;. Fails immediately if taken.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition ${
                  strategy === 'naive'
                    ? 'border-rose-500/50 bg-rose-950/20 text-white'
                    : 'border-white/[0.06] bg-[#121824] text-slate-400 hover:text-white'
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
                  <p className="font-semibold text-rose-400">Naive without locks (vulnerable demo)</p>
                  <p className="text-[11px] text-slate-400">
                    Separate read followed by write. Deliberately produces duplicate allocations under concurrency.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Contested seats</label>
              <select
                value={targetSeatsCount}
                onChange={(e) => setTargetSeatsCount(Number(e.target.value))}
                className="w-full rounded-lg border border-white/[0.1] bg-[#121824] p-2 text-xs text-white"
              >
                <option value={1}>1 seat (Hotspot)</option>
                <option value={5}>5 seats</option>
                <option value={10}>10 seats</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Parallel clients</label>
              <select
                value={concurrentRequests}
                onChange={(e) => setConcurrentRequests(Number(e.target.value))}
                className="w-full rounded-lg border border-white/[0.1] bg-[#121824] p-2 text-xs text-white"
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
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition disabled:opacity-40"
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
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101a] p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div>
                  <span className="text-[10px] text-slate-400">Benchmark result</span>
                  <h3 className="text-base font-bold text-white">
                    {benchmarkResult.strategy} execution metrics
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-cyan-400">
                    {benchmarkResult.throughputRps} RPS
                  </span>
                  <p className="text-[10px] text-slate-400">in {benchmarkResult.durationMs} ms</p>
                </div>
              </div>

              {/* Status Outcome Distribution */}
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-2">Outcome distribution</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
                    <p className="text-xl font-bold text-emerald-400">
                      {benchmarkResult.successfulHolds}
                    </p>
                    <p className="text-xs text-slate-200 font-medium">201 Created</p>
                    <p className="text-[10px] text-slate-400">Held: {benchmarkResult.actualHeldSeatsCount}</p>
                  </div>

                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
                    <p className="text-xl font-bold text-amber-400">
                      {benchmarkResult.conflicts409}
                    </p>
                    <p className="text-xs text-slate-200 font-medium">409 Conflict</p>
                    <p className="text-[10px] text-slate-400">Rejected safely</p>
                  </div>

                  <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 p-3">
                    <p className="text-xl font-bold text-rose-400">
                      {benchmarkResult.errors500}
                    </p>
                    <p className="text-xs text-slate-200 font-medium">500 Server errors</p>
                    <p className="text-[10px] text-slate-400">Zero deadlocks</p>
                  </div>
                </div>
              </div>

              {/* Latency Percentiles */}
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-2">Latency distribution (ms)</p>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="rounded border border-white/[0.04] bg-[#121824] p-2">
                    <span className="text-[10px] text-slate-400 block">Min</span>
                    <strong className="text-white">{benchmarkResult.latencyMs.min}ms</strong>
                  </div>
                  <div className="rounded border border-white/[0.04] bg-[#121824] p-2">
                    <span className="text-[10px] text-slate-400 block">P50</span>
                    <strong className="text-cyan-300">{benchmarkResult.latencyMs.p50}ms</strong>
                  </div>
                  <div className="rounded border border-white/[0.04] bg-[#121824] p-2">
                    <span className="text-[10px] text-slate-400 block">P90</span>
                    <strong className="text-amber-300">{benchmarkResult.latencyMs.p90}ms</strong>
                  </div>
                  <div className="rounded border border-white/[0.04] bg-[#121824] p-2">
                    <span className="text-[10px] text-slate-400 block">P99</span>
                    <strong className="text-slate-300">{benchmarkResult.latencyMs.p99}ms</strong>
                  </div>
                  <div className="rounded border border-white/[0.04] bg-[#121824] p-2">
                    <span className="text-[10px] text-slate-400 block">Max</span>
                    <strong className="text-slate-400">{benchmarkResult.latencyMs.max}ms</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#0c101a] p-10 text-center text-xs text-slate-400">
              <Zap className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              Select parameters on the left and click &quot;Execute benchmark&quot; to test concurrent ticket drops.
            </div>
          )}

          {/* Database SQL Integrity Check Banner */}
          {integrityReport && (
            <div
              className={`rounded-xl border p-4 ${
                integrityReport.status === 'PASSED'
                  ? 'border-emerald-500/30 bg-emerald-950/20'
                  : 'border-rose-500/30 bg-rose-950/20'
              }`}
            >
              <div className="flex items-center gap-3">
                {integrityReport.status === 'PASSED' ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0" />
                )}
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {integrityReport.status === 'PASSED'
                      ? 'Integrity scan passed: 0 double bookings detected'
                      : 'Integrity conflict detected'}
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
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
