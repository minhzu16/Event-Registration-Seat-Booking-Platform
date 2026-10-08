import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'SeatLock — Event Registration & Zero-Collision Seat Booking Platform',
  description:
    'High-concurrency ticket drops and reserved auditorium seating with row-level locks, SSE live updates, and cryptographic HMAC-signed QR passes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080b11] text-slate-100 antialiased flex flex-col selection:bg-amber-500/20 selection:text-amber-300">
        <Navbar />
        <main className="flex-1 pb-16">{children}</main>
        <footer className="border-t border-white/[0.08] py-8 text-xs text-slate-400 bg-[#06080e]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-300">SeatLock</span>
              <span className="text-slate-600">|</span>
              <span>PostgreSQL 18 Row Locking & Real-time SSE Dispatch</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ACID Isolation Guarantee
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
