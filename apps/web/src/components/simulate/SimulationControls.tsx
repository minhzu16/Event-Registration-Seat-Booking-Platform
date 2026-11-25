import React from 'react';
import { Gauge, Play, RefreshCw } from 'lucide-react';
import { SimulationSession } from '@/lib/api';

export type LockingStrategy = 'pessimistic' | 'conditional' | 'naive';

interface SimulationControlsProps {
  sessions: SimulationSession[];
  selectedSessionId: string;
  onSessionChange: (id: string) => void;
  strategy: LockingStrategy;
  onStrategyChange: (s: LockingStrategy) => void;
  targetSeatsCount: number;
  onTargetSeatsChange: (n: number) => void;
  concurrentRequests: number;
  onConcurrentRequestsChange: (n: number) => void;
  isRunning: boolean;
  onRun: () => void;
}

export function SimulationControls({
  sessions,
  selectedSessionId,
  onSessionChange,
  strategy,
  onStrategyChange,
  targetSeatsCount,
  onTargetSeatsChange,
  concurrentRequests,
  onConcurrentRequestsChange,
  isRunning,
  onRun,
}: SimulationControlsProps) {
  return (
    <div className="lg:col-span-1 rounded-xl border border-white/70 glass p-5 space-y-4">
      <h3 className="text-xs font-bold text-slate-700 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-indigo-600" />
        Simulation parameters
      </h3>

      <div>
        <label className="text-[11px] font-medium text-slate-600 block mb-1">Target session</label>
        <select
          value={selectedSessionId}
          onChange={(e) => onSessionChange(e.target.value)}
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
              onChange={() => onStrategyChange('pessimistic')}
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
              onChange={() => onStrategyChange('conditional')}
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
              onChange={() => onStrategyChange('naive')}
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
            onChange={(e) => onTargetSeatsChange(Number(e.target.value))}
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
            onChange={(e) => onConcurrentRequestsChange(Number(e.target.value))}
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
        onClick={onRun}
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
  );
}
