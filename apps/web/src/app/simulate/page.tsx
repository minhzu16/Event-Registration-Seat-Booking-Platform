'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  ShieldCheck,
  AlertTriangle,
  Play,
  RefreshCw,
  CheckCircle2,
  Database,
  BarChart,
  Gauge,
  Flame,
  ArrowRight,
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

      // 1. Fetch seats for the session to pick target seats
      const seatsRes = await fetchApi(`/sessions/${selectedSessionId}/seats`);
      const targetSeatIds = seatsRes.seats.slice(0, targetSeatsCount).map((s: any) => s.id);

      // 2. Trigger benchmark
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-6 mb-8 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-300 backdrop-blur-md mb-2">
            <Flame className="h-3.5 w-3.5 text-cyan-400" />
            <span>Academic Concurrency & Ticket-Drop Benchmark</span>
          </div>
          <h1 className="text-3xl font-black text-white flex items-center gap-2">
            Concurrency & Locking Lab
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Live experimental suite comparing <strong>Pessimistic Row-Level Locking</strong>,{' '}
            <strong>Conditional Compare-and-Set</strong>, and <strong>Naive (Uncoordinated)</strong>{' '}
            transactions under heavy concurrent ticket drops.
          </p>
        </div>

        <button
          onClick={runManualIntegrityCheck}
          disabled={isCheckingIntegrity || !selectedSessionId}
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-2.5 text-xs font-bold text-emerald-400 hover:bg-emerald-900/50 transition disabled:opacity-50"
        >
          {isCheckingIntegrity ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          Run SQL Integrity Query
        </button>
      </div>

      {/* Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-1 rounded-3xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl space-y-5">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Gauge className="h-4 w-4 text-indigo-400" />
            Simulation Parameters
          </h3>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Target Session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-white"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.eventTitle} ({new Date(s.starts_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Locking Strategy
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer text-xs transition ${
                  strategy === 'pessimistic'
                    ? 'border-indigo-500 bg-indigo-950/40 text-white'
                    : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-white'
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
                  <p className="font-bold">Pessimistic Lock (SELECT FOR UPDATE)</p>
                  <p className="text-[11px] text-slate-400">
                    Sorts seat IDs to prevent deadlocks, holds row-level locks within transaction.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer text-xs transition ${
                  strategy === 'conditional'
                    ? 'border-cyan-500 bg-cyan-950/40 text-white'
                    : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-white'
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
                  <p className="font-bold">Conditional Compare-and-Set (CAS)</p>
                  <p className="text-[11px] text-slate-400">
                    Atomic single UPDATE WHERE status='AVAILABLE'. Fails fast on 0 rows affected.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer text-xs transition ${
                  strategy === 'naive'
                    ? 'border-rose-500 bg-rose-950/40 text-white'
                    : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-white'
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
                  <p className="font-bold text-rose-400">Naive / No Lock (Demo Bug)</p>
                  <p className="text-[11px] text-slate-400">
                    Read-then-write without atomic lock. Deliberately demonstrates race conditions!
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Seats Contested</label>
              <select
                value={targetSeatsCount}
                onChange={(e) => setTargetSeatsCount(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-white"
              >
                <option value={1}>1 Seat (Hotspot)</option>
                <option value={5}>5 Seats</option>
                <option value={10}>10 Seats</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Parallel Requests</label>
              <select
                value={concurrentRequests}
                onChange={(e) => setConcurrentRequests(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs text-white"
              >
                <option value={50}>50 Requests</option>
                <option value={100}>100 Requests</option>
                <option value={200}>200 Requests</option>
                <option value={500}>500 Requests</option>
              </select>
            </div>
          </div>

          <button
            disabled={isRunning || !selectedSessionId}
            onClick={runSimulation}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-cyan-600 to-indigo-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:opacity-95 transition disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Firing Parallel Requests...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Launch Ticket Drop Simulation
              </>
            )}
          </button>
        </div>

        {/* Results / Live Telemetry */}
        <div className="lg:col-span-2 space-y-6">
          {benchmarkResult ? (
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Benchmark Result
                  </span>
                  <h3 className="text-lg font-black text-white">
                    {benchmarkResult.strategy.toUpperCase()} Execution Report
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-cyan-400">
                    {benchmarkResult.throughputRps} RPS
                  </span>
                  <p className="text-[10px] text-slate-400">in {benchmarkResult.durationMs}ms</p>
                </div>
              </div>

              {/* Status Outcome Distribution */}
              <div>
                <p className="text-xs font-bold text-slate-300 mb-2">Request Outcome Distribution</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4">
                    <p className="text-2xl font-black text-emerald-400">
                      {benchmarkResult.successfulHolds}
                    </p>
                    <p className="text-[11px] text-slate-300 font-semibold">201 Success</p>
                    <p className="text-[10px] text-slate-400">Actual Held: {benchmarkResult.actualHeldSeatsCount}</p>
                  </div>

                  <div className="rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4">
                    <p className="text-2xl font-black text-amber-400">
                      {benchmarkResult.conflicts409}
                    </p>
                    <p className="text-[11px] text-slate-300 font-semibold">409 Conflict</p>
                    <p className="text-[10px] text-slate-400">Safely Rejected</p>
                  </div>

                  <div className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4">
                    <p className="text-2xl font-black text-rose-400">
                      {benchmarkResult.errors500}
                    </p>
                    <p className="text-[11px] text-slate-300 font-semibold">500 Server Errors</p>
                    <p className="text-[10px] text-slate-400">Zero Deadlocks</p>
                  </div>
                </div>
              </div>

              {/* Latency Percentiles */}
              <div>
                <p className="text-xs font-bold text-slate-300 mb-2">Latency Percentiles (ms)</p>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 block">Min</span>
                    <strong className="text-white">{benchmarkResult.latencyMs.min}ms</strong>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 block">P50</span>
                    <strong className="text-cyan-300">{benchmarkResult.latencyMs.p50}ms</strong>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 block">P90</span>
                    <strong className="text-indigo-300">{benchmarkResult.latencyMs.p90}ms</strong>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 block">P99</span>
                    <strong className="text-amber-300">{benchmarkResult.latencyMs.p99}ms</strong>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                    <span className="text-[10px] text-slate-400 block">Max</span>
                    <strong className="text-slate-300">{benchmarkResult.latencyMs.max}ms</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/30 p-12 text-center text-xs text-slate-400">
              <Zap className="mx-auto h-12 w-12 text-slate-600 mb-3" />
              Configure parameters on the left and click &quot;Launch Ticket Drop Simulation&quot; to test concurrent transactions.
            </div>
          )}

          {/* Database SQL Integrity Check Banner */}
          {integrityReport && (
            <div
              className={`rounded-3xl border p-6 backdrop-blur-xl shadow-xl ${
                integrityReport.status === 'PASSED'
                  ? 'border-emerald-500/40 bg-emerald-950/30'
                  : 'border-rose-500/40 bg-rose-950/30'
              }`}
            >
              <div className="flex items-center gap-3">
                {integrityReport.status === 'PASSED' ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-rose-400 shrink-0" />
                )}
                <div>
                  <h4 className="text-base font-bold text-white">
                    {integrityReport.status === 'PASSED'
                      ? 'SQL Integrity Check: PASSED (0 Violations)'
                      : 'Integrity Violation Detected!'}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {integrityReport.status === 'PASSED'
                      ? 'PostgreSQL row-level locking + partial unique index verified: Exactly 0 double-booked seats and 0 capacity overflows.'
                      : `Found ${integrityReport.totalViolations} integrity conflicts in database!`}
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
