import React from 'react';

export function SeatLegend() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-5 border-t border-slate-200 pt-5 text-xs text-slate-600">
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-sky-500 border border-sky-400" />
        <span>Available</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-slate-900 border border-indigo-500 flex items-center justify-center">
          <span className="h-1 w-1 rounded-full bg-white" />
        </span>
        <span>Selected (Yours)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-red-600 border border-red-500" />
        <span>Held by others</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-slate-300 border border-slate-400 flex items-center justify-center">
          <span className="h-0.5 w-1.5 bg-slate-500" />
        </span>
        <span>Booked</span>
      </div>
    </div>
  );
}
