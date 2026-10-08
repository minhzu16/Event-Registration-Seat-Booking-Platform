'use client';

import React, { useState, useEffect } from 'react';
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
import { getStoredUser, setAuth, clearAuth, fetchApi, User } from '@/lib/api';

export function Navbar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      setCurrentUser(user);
    } else {
      quickLoginAs('alice@example.com', 'password123');
    }
  }, []);

  async function quickLoginAs(email: string, pass: string = 'password123') {
    try {
      const res = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass }),
      });
      setAuth(res.token, res.user);
      setCurrentUser(res.user);
      setRoleSwitcherOpen(false);
      window.dispatchEvent(new Event('auth-changed'));
    } catch (err) {
      console.error('Quick login failed', err);
    }
  }

  function handleLogout() {
    clearAuth();
    setCurrentUser(null);
    setDropdownOpen(false);
    window.dispatchEvent(new Event('auth-changed'));
  }

  const navLinks = [
    { href: '/', label: 'Events', icon: Ticket },
    { href: '/bookings', label: 'My passes', icon: Ticket },
    { href: '/organiser', label: 'Studio', icon: Building2 },
    { href: '/checkin', label: 'Scanner', icon: ScanLine },
    { href: '/simulate', label: 'Concurrency lab', icon: Zap, highlight: true },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#080b11]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#141b29] border border-amber-500/30 text-amber-400 group-hover:border-amber-400 transition">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-base font-extrabold tracking-tight text-white">SeatLock</span>
              <span className="text-[11px] font-medium text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded">Live</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Auditorium booking engine</p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  isActive
                    ? 'bg-[#162032] text-amber-400 border border-amber-500/20 shadow-sm'
                    : link.highlight
                    ? 'text-cyan-400 hover:bg-cyan-500/10'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
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
          {/* Quick Role Switcher */}
          <div className="relative">
            <button
              onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
              className="flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#0e1422] px-2.5 py-1.5 text-xs text-slate-300 hover:border-white/[0.2] transition"
              title="Switch role"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
              <span>{currentUser?.role || 'Guest'}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {roleSwitcherOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-white/[0.1] bg-[#0c101a] p-1.5 shadow-xl backdrop-blur-xl z-50">
                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">
                  Switch identity
                </div>
                <button
                  onClick={() => quickLoginAs('alice@example.com')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-slate-200 hover:bg-[#162032] transition"
                >
                  <div>
                    <p className="font-medium">Alice</p>
                    <p className="text-[10px] text-slate-400">alice@example.com</p>
                  </div>
                  <span className="text-[10px] text-slate-400">Attendee</span>
                </button>
                <button
                  onClick={() => quickLoginAs('organiser@techsummit.io')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-slate-200 hover:bg-[#162032] transition"
                >
                  <div>
                    <p className="font-medium">Sarah</p>
                    <p className="text-[10px] text-slate-400">organiser@techsummit.io</p>
                  </div>
                  <span className="text-[10px] text-amber-400">Organiser</span>
                </button>
                <button
                  onClick={() => quickLoginAs('staff@eventplatform.com')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-slate-200 hover:bg-[#162032] transition"
                >
                  <div>
                    <p className="font-medium">Gate Staff</p>
                    <p className="text-[10px] text-slate-400">staff@eventplatform.com</p>
                  </div>
                  <span className="text-[10px] text-cyan-400">Staff</span>
                </button>
                <button
                  onClick={() => quickLoginAs('admin@eventplatform.com')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded text-xs text-slate-200 hover:bg-[#162032] transition"
                >
                  <div>
                    <p className="font-medium">Admin</p>
                    <p className="text-[10px] text-slate-400">admin@eventplatform.com</p>
                  </div>
                  <span className="text-[10px] text-rose-400">Admin</span>
                </button>
              </div>
            )}
          </div>

          {/* User Account / Avatar */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-[#0e1422] p-1 pr-2.5 text-xs text-slate-200 hover:border-white/[0.2] transition"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold">
                  {currentUser.fullName.charAt(0)}
                </div>
                <span className="max-w-[90px] truncate font-medium hidden sm:inline-block">
                  {currentUser.fullName}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-white/[0.1] bg-[#0c101a] p-1.5 shadow-xl backdrop-blur-xl z-50">
                  <div className="px-2.5 py-1.5 border-b border-white/[0.06]">
                    <p className="text-xs font-medium text-white">{currentUser.fullName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
                  </div>
                  <Link
                    href="/bookings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-slate-300 hover:bg-[#162032] transition mt-1"
                  >
                    <Ticket className="h-3.5 w-3.5 text-amber-400" />
                    My tickets
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-rose-400 hover:bg-rose-500/10 transition mt-1"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => quickLoginAs('alice@example.com')}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
