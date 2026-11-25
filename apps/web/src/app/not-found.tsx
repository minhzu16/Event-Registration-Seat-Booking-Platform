import React from 'react';
import Link from 'next/link';
import { Compass, Home, Calendar } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl glass-strong border border-white/70 p-8 text-center shadow-lg shadow-indigo-900/10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 border border-indigo-200 mb-5">
          <Compass className="h-7 w-7 text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Page not found</h2>
        <p className="text-xs text-slate-600 leading-relaxed mb-6">
          The event session, seat map, or booking page you are searching for does not exist or has concluded.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
          >
            <Calendar className="h-3.5 w-3.5" />
            Discover events
          </Link>
          <Link
            href="/bookings"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/70 glass px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 transition"
          >
            <Home className="h-3.5 w-3.5" />
            My bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
