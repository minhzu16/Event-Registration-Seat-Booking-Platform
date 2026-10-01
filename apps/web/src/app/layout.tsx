import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'SeatLock — Event Registration & Zero-Collision Seat Booking Platform',
  description:
    'High-concurrency ticket drop and reserved seating platform featuring atomic transactions, PostgreSQL row-level locking, SSE realtime sync, and HMAC-signed QR tickets.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased flex flex-col">
        <Navbar />
        <main className="flex-1 pb-16">{children}</main>
        <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-500">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© 2026 SeatLock Architecture Lab. PostgreSQL 18 Row Locking & Real-time Distributed Coordination.</p>
            <div className="flex items-center gap-4 text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                ACID Engine: Zero Double-Booking Guarantee
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
