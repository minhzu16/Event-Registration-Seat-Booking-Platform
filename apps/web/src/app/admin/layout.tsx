'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { LayoutDashboard, Users, Calendar } from 'lucide-react';

interface TabItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  exact: boolean;
}

const tabs: TabItem[] = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Users', href: '/admin/users', icon: Users, exact: false },
  { label: 'Events', href: '/admin/events', icon: Calendar, exact: false },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminGuard>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Admin console
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              System monitoring, user roles, and event status management.
            </p>
          </div>

          <nav
            className="flex items-center gap-2 border-b border-slate-200/60 pb-3"
            aria-label="Admin Navigation"
          >
            {tabs.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>

        <main>{children}</main>
      </div>
    </AdminGuard>
  );
}
