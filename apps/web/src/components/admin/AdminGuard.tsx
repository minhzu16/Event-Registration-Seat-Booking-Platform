'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ShieldAlert, LogIn } from 'lucide-react';
import { User } from '@/lib/api';

function subscribe(callback: () => void) {
  window.addEventListener('auth-changed', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('auth-changed', callback);
    window.removeEventListener('storage', callback);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem('user');
}

function getServerSnapshot(): string | null {
  return null;
}

export function useAdminUser(): { user: User | null; isReady: boolean } {
  const userJson = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    let ignore = false;
    Promise.resolve().then(() => {
      if (!ignore) {
        setMounted(true);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  if (!mounted) {
    return { user: null, isReady: false };
  }

  if (!userJson) {
    return { user: null, isReady: true };
  }

  try {
    const user = JSON.parse(userJson) as User;
    return { user, isReady: true };
  } catch {
    return { user: null, isReady: true };
  }
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useAdminUser();

  if (!isReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="glass-card flex items-center gap-3 p-6 max-w-sm w-full text-slate-600">
          <div className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          <span className="text-sm font-medium">Checking authorization…</span>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className="glass-card max-w-md w-full text-center p-8 space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Admin access required
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {user
              ? `You are signed in as ${user.fullName} (${user.role}), but this area requires administrator privileges.`
              : 'You must be signed in with an administrator account to view this page.'}
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="btn btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default AdminGuard;
