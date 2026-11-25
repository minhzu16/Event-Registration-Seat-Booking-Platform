'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[SeatLock App Error]', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl glass-strong border border-red-200 p-8 text-center shadow-lg shadow-indigo-900/10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 border border-red-200 mb-5">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-xs text-slate-600 leading-relaxed mb-6">
          {error.message || 'An unexpected error occurred during the session. Your booking state is preserved.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/70 glass px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 transition"
          >
            <Home className="h-3.5 w-3.5" />
            Back to events
          </Link>
        </div>
      </div>
    </div>
  );
}
