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
  User as UserIcon,
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
    // Check initial user or auto-login default attendee if none
    const user = getStoredUser();
    if (user) {
      setCurrentUser(user);
    } else {
      // Auto-login default attendee for seamless first-time experience
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
    { href: '/', label: 'Explore Events', icon: Ticket },
    { href: '/bookings', label: 'My Tickets', icon: Ticket },
    { href: '/organiser', label: 'Organiser Studio', icon: Building2 },
    { href: '/checkin', label: 'Check-in Staff', icon: ScanLine },
    { href: '/simulate', label: 'Concurrency Lab', icon: Zap, highlight: true },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-2 shadow-lg shadow-indigo-500/25 transition group-hover:scale-105">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
              Seat<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Lock</span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">v2.0</span>
            </span>
            <p className="text-[10px] text-slate-400 leading-none">Zero-Collision Seat Booking</p>
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
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                    : link.highlight
                    ? 'text-cyan-400 hover:bg-cyan-500/10 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`h-4 w-4 ${link.highlight ? 'text-cyan-400' : ''}`} />
                {link.label}
                {link.highlight && (
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right side: Role Switcher & User Profile */}
        <div className="flex items-center gap-3">
          {/* Quick Role Switcher Button */}
          <div className="relative">
            <button
              onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/40 transition"
              title="Quickly switch roles for testing"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
              <span>Role: <strong className="text-white font-semibold">{currentUser?.role || 'Guest'}</strong></span>
              <ChevronDown className="h-3 w-3 text-indigo-400" />
            </button>

            {roleSwitcherOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-2xl z-50">
                <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Switch Active Role
                </div>
                <button
                  onClick={() => quickLoginAs('alice@example.com')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 transition"
                >
                  <div>
                    <p className="font-semibold">Alice (Attendee)</p>
                    <p className="text-[10px] text-slate-400">alice@example.com</p>
                  </div>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">USER</span>
                </button>
                <button
                  onClick={() => quickLoginAs('organiser@techsummit.io')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 transition"
                >
                  <div>
                    <p className="font-semibold">Sarah (Organiser)</p>
                    <p className="text-[10px] text-slate-400">organiser@techsummit.io</p>
                  </div>
                  <span className="rounded bg-indigo-900/60 text-indigo-300 px-1.5 py-0.5 text-[10px]">HOST</span>
                </button>
                <button
                  onClick={() => quickLoginAs('staff@eventplatform.com')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 transition"
                >
                  <div>
                    <p className="font-semibold">Gate Staff</p>
                    <p className="text-[10px] text-slate-400">staff@eventplatform.com</p>
                  </div>
                  <span className="rounded bg-cyan-900/60 text-cyan-300 px-1.5 py-0.5 text-[10px]">STAFF</span>
                </button>
                <button
                  onClick={() => quickLoginAs('admin@eventplatform.com')}
                  className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 transition"
                >
                  <div>
                    <p className="font-semibold">System Admin</p>
                    <p className="text-[10px] text-slate-400">admin@eventplatform.com</p>
                  </div>
                  <span className="rounded bg-rose-900/60 text-rose-300 px-1.5 py-0.5 text-[10px]">ADMIN</span>
                </button>
              </div>
            )}
          </div>

          {/* User Account / Avatar */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 p-1 pr-3 text-sm text-slate-200 hover:border-indigo-500/40 transition"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500 text-xs font-bold text-white">
                  {currentUser.fullName.charAt(0)}
                </div>
                <span className="max-w-[100px] truncate text-xs font-medium hidden sm:inline-block">
                  {currentUser.fullName}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-2xl z-50">
                  <div className="px-3 py-2 border-b border-white/5">
                    <p className="text-xs font-semibold text-white">{currentUser.fullName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{currentUser.email}</p>
                  </div>
                  <Link
                    href="/bookings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 transition"
                  >
                    <Ticket className="h-3.5 w-3.5 text-indigo-400" />
                    My Bookings & QR Codes
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition mt-1"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => quickLoginAs('alice@example.com')}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
