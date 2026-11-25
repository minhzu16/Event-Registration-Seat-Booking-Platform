'use client';

import React, { useState, useEffect } from 'react';
import { Zap, RefreshCw, Database } from 'lucide-react';
import {
  fetchApi,
  Event,
  Seat,
  BenchmarkResult,
  IntegrityReport,
  SimulationSession,
} from '@/lib/api';
import { DEMO_MODE } from '@/lib/demo';
import { SimulationControls, LockingStrategy } from '@/components/simulate/SimulationControls';
import { SimulationResults } from '@/components/simulate/SimulationResults';

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
  const [strategy, setStrategy] = useState<LockingStrategy>('pessimistic');

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
        <SimulationControls
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSessionChange={setSelectedSessionId}
          strategy={strategy}
          onStrategyChange={setStrategy}
          targetSeatsCount={targetSeatsCount}
          onTargetSeatsChange={setTargetSeatsCount}
          concurrentRequests={concurrentRequests}
          onConcurrentRequestsChange={setConcurrentRequests}
          isRunning={isRunning}
          onRun={runSimulation}
        />

        <SimulationResults
          benchmarkResult={benchmarkResult}
          integrityReport={integrityReport}
        />
      </div>
    </div>
  );
}
