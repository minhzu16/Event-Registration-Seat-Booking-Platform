'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { fetchApi, setAuth, User } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetchApi<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuth(res.token, res.user);
      window.dispatchEvent(new Event('auth-changed'));
      router.push('/');
    } catch (err) {
      const { status, message } = (err ?? {}) as { status?: number; message?: string };
      setError(status === 401 ? 'Incorrect email or password.' : message || 'Sign-in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white/70 p-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/60';

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
        <LogIn className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        Sign in
      </h1>
      <p className="text-xs text-slate-600 mt-1">Use the account your organiser or administrator gave you.</p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-xl glass border border-white/70 p-5"
      >
        <div>
          <label htmlFor="email" className="text-[11px] font-medium text-slate-600 block mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="text-[11px] font-medium text-slate-600 block mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
