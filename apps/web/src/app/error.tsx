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
      <div className="w-full max-w-md rounded-2xl border border-rose-500/20 bg-[#0f1420]/80 p-8 text-center backdrop-blur-xl shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/20 mb-5">
          <AlertTriangle className="h-7 w-7 text-rose-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          {error.message || 'An unexpected error occurred during the session. Your booking state is preserved.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Try again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#121824] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white transition"
          >
            <Home className="h-3.5 w-3.5" />
            Back to events
          </Link>
        </div>
      </div>
    </div>
  );
}

