import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Validation must fail before any SQL runs.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database.js', () => ({ query, withTransaction: vi.fn(), pool: {} }));

const saved = { JWT_SECRET: process.env.JWT_SECRET, NODE_ENV: process.env.NODE_ENV };

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'validation-details-test-secret-0123456789abcdef';
  process.env.NODE_ENV = 'test';
  vi.resetModules();
  const { default: authRoutes } = await import('../src/routes/auth.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('400 VALIDATION_ERROR responses carry the zod issues', () => {
  it('register with a bad email lists the failing field in details', async () => {
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'x', fullName: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details?: Array<{ path: unknown[] }> };
    expect(body.error).toBe('VALIDATION_ERROR');
    // zod 4 renamed ZodError.errors to .issues; reading the old name silently sent `details: undefined`.
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details!.some((i) => i.path.includes('email'))).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});
