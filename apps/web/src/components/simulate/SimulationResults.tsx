import React from 'react';
import { Zap, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BenchmarkResult, IntegrityReport } from '@/lib/api';

interface SimulationResultsProps {
  benchmarkResult: BenchmarkResult | null;
  integrityReport: IntegrityReport | null;
}

export function SimulationResults({
  benchmarkResult,
  integrityReport,
}: SimulationResultsProps) {
  return (
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
  );
}
