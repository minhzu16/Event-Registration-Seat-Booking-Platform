'use client';

import React from 'react';

export type StatTone = 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
}

const toneChipClasses: Record<StatTone, string> = {
  accent: 'bg-indigo-100 text-indigo-700',
  success: 'chip-success',
  warning: 'chip-warning',
  danger: 'chip-danger',
  info: 'chip-info',
};

const toneIconClasses: Record<StatTone, string> = {
  accent: 'bg-indigo-50 text-indigo-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  info: 'bg-sky-50 text-sky-700',
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'accent',
  icon,
}: StatCardProps) {
  return (
    <div className="glass-card flex flex-col justify-between p-5 sm:p-6 transition-all duration-150 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        {icon && (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneIconClasses[tone]}`}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className="text-3xl font-bold tabular-nums text-slate-900 tracking-tight">
          {value}
        </span>
        {hint && (
          <span className={`chip ${toneChipClasses[tone]}`}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

export default StatCard;
