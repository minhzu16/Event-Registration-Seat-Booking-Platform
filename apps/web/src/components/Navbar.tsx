'use client';

import React, { useState, useEffect, useSyncExternalStore, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Ticket,
  ShieldCheck,
  Building2,
  ScanLine,
  Zap,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { setAuth, clearAuth, fetchApi, initAuthSession, User } from '@/lib/api';
import { DEMO_MODE } from '@/lib/demo';

function subscribe(cb: () => void) {
  window.addEventListener('auth-changed', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('auth-changed', cb);
    window.removeEventListener('storage', cb);
  };
}

/** Signs in a seeded demo account; the store subscription re-renders the navbar via `auth-changed`. */
async function demoLogin(email: string, password = 'password123'): Promise<void> {
  try {
    const res = await fetchApi<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuth(res.token, res.user);
    window.dispatchEvent(new Event('auth-changed'));
  } catch (err) {
    console.error('Quick login failed', err);
  }
}

export function Navbar() {
  const pathname = usePathname();
  const userJson = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem('user'),
    () => null
  );
  const currentUser = useMemo<User | null>(
    () => (userJson ? (JSON.parse(userJson) as User) : null),
    [userJson]
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  async function quickLoginAs(email: string) {
    await demoLogin(email);
    setRoleSwitcherOpen(false);
  }

  useEffect(() => {
    initAuthSession().then((restored) => {
      if (!restored && !localStorage.getItem('user') && DEMO_MODE) {
        void demoLogin('alice@example.com');
      }
    });
  }, []);

  async function handleLogout() {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    }
    clearAuth();
    setDropdownOpen(false);
    window.dispatchEvent(new Event('auth-changed'));
  }

  const isAdmin = currentUser?.role === 'ADMIN';

  const navLinks: { href: string; label: string; icon: typeof Ticket; highlight?: boolean }[] = [
    { href: '/', label: 'Events', icon: Ticket },
    { href: '/bookings', label: 'My passes', icon: Ticket },
    { href: '/organiser', label: 'Studio', icon: Building2 },
    { href: '/checkin', label: 'Scanner', icon: ScanLine },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
    ...(DEMO_MODE ? [{ href: '/simulate', label: 'Concurrency lab', icon: Zap, highlight: true }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 glass-strong border-b border-white/70">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200/80 text-indigo-600 group-hover:border-indigo-400 group-hover:text-indigo-700 transition">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-base font-extrabold tracking-tight text-slate-900">SeatLock</span>
              <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200/50 px-1.5 py-0.5 rounded">Live</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Auditorium booking engine</p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  isActive
                    ? 'bg-indigo-50/80 text-indigo-600 border border-indigo-200/60 font-semibold shadow-xs'
                    : link.highlight
                    ? 'text-sky-600 hover:bg-sky-50 hover:text-sky-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side: Role Switcher & User Profile */}
        <div className="flex items-center gap-3">
          {/* Quick Role Switcher: demo mode only, the demo accounts share a public password */}
          {DEMO_MODE && (
            <div className="relative">
              <button
                onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
                className="flex items-center gap-1.5 rounded-md border border-white/70 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white/80 hover:text-slate-900 shadow-xs transition"
                title="Switch role"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                <span>{currentUser?.role || 'Guest'}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {roleSwitcherOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl z-50">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Switch identity
                  </div>
                  <button
                    onClick={() => quickLoginAs('alice@example.com')}
                    className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-indigo-50/60 hover:text-slate-900 transition"
                  >
                    <div>
                      <p className="font-medium text-slate-800">Alice</p>
                      <p className="text-[10px] text-slate-500">alice@example.com</p>
                    </div>
                    <span className="text-[10px] text-slate-500">Attendee</span>
                  </button>
                  <button
                    onClick={() => quickLoginAs('organiser@techsummit.io')}
                    className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-indigo-50/60 hover:text-slate-900 transition"
                  >
                    <div>
                      <p className="font-medium text-slate-800">Sarah</p>
                      <p className="text-[10px] text-slate-500">organiser@techsummit.io</p>
                    </div>
                    <span className="text-[10px] font-medium text-indigo-600">Organiser</span>
                  </button>
                  <button
                    onClick={() => quickLoginAs('staff@eventplatform.com')}
                    className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-indigo-50/60 hover:text-slate-900 transition"
                  >
                    <div>
                      <p className="font-medium text-slate-800">Gate Staff</p>
                      <p className="text-[10px] text-slate-500">staff@eventplatform.com</p>
                    </div>
                    <span className="text-[10px] font-medium text-sky-600">Staff</span>
                  </button>
                  <button
                    onClick={() => quickLoginAs('admin@eventplatform.com')}
                    className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-indigo-50/60 hover:text-slate-900 transition"
                  >
                    <div>
                      <p className="font-medium text-slate-800">Admin</p>
                      <p className="text-[10px] text-slate-500">admin@eventplatform.com</p>
                    </div>
                    <span className="text-[10px] font-medium text-rose-600">Admin</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* User Account / Avatar */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-full border border-white/70 bg-white/60 p-1 pr-2.5 text-xs text-slate-700 hover:bg-white/80 hover:text-slate-900 shadow-xs transition"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                  {currentUser.fullName.charAt(0)}
                </div>
                <span className="max-w-[90px] truncate font-medium text-slate-800 hidden sm:inline-block">
                  {currentUser.fullName}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl z-50">
                  <div className="px-2.5 py-1.5 border-b border-slate-200/60">
                    <p className="text-xs font-semibold text-slate-900">{currentUser.fullName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{currentUser.email}</p>
                  </div>
                  <Link
                    href="/bookings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-indigo-50/60 hover:text-slate-900 transition mt-1"
                  >
                    <Ticket className="h-3.5 w-3.5 text-indigo-600" />
                    My tickets
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition mt-1"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : DEMO_MODE ? (
            <button
              onClick={() => quickLoginAs('alice@example.com')}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-xs transition"
            >
              Sign in
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-xs transition"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
