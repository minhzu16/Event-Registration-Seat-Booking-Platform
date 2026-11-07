import React from 'react';
import Link from 'next/link';
import { Compass, Home, Calendar } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0c101a]/90 p-8 text-center backdrop-blur-xl shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 mb-5">
          <Compass className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Page not found</h2>
        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          The event session, seat map, or booking page you are searching for does not exist or has concluded.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
          >
            <Calendar className="h-3.5 w-3.5" />
            Discover events
          </Link>
          <Link
            href="/bookings"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#121824] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white transition"
          >
            <Home className="h-3.5 w-3.5" />
            My bookings
          </Link>
        </div>
      </div>
    </div>
  );
}

