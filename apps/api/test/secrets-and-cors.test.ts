import { describe, it, expect, afterAll, vi } from 'vitest';
import express from 'express';
import cors from 'cors';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const KEYS = ['JWT_SECRET', 'QR_HMAC_SECRET', 'CORS_ORIGINS'] as const;
type Env = Partial<Record<(typeof KEYS)[number], string>>;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const GOOD = { JWT_SECRET: 'j'.repeat(32), QR_HMAC_SECRET: 'q'.repeat(32) };

/** Re-imports a module after setting the env (blank instead of delete so a local .env can't leak in). */
async function load<T>(path: string, env: Env): Promise<T> {
  vi.resetModules();
  for (const key of KEYS) process.env[key] = env[key] ?? '';
  return import(path) as Promise<T>;
}

afterAll(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('Secrets have no built-in defaults', () => {
  it.each([
    ['JWT_SECRET', { QR_HMAC_SECRET: GOOD.QR_HMAC_SECRET }],
    ['JWT_SECRET', { ...GOOD, JWT_SECRET: 'too-short' }],
    ['QR_HMAC_SECRET', { JWT_SECRET: GOOD.JWT_SECRET }],
    ['QR_HMAC_SECRET', { ...GOOD, QR_HMAC_SECRET: 'too-short' }],
  ])('refuses to boot when %s is missing or shorter than 32 characters', async (key, env) => {
    await expect(load('../src/config.js', env)).rejects.toThrow(new RegExp(key));
  });

  it('boots with 32+ character secrets', async () => {
    const { config } = await load<typeof import('../src/config.js')>('../src/config.js', GOOD);
    expect(config.JWT_SECRET).toBe(GOOD.JWT_SECRET);
  });
});

describe('CORS only answers configured origins', () => {
  let server: Server;
  let base: string;

  afterAll(() => {
    server?.close();
  });

  async function start() {
    const { corsOptions } = await load<typeof import('../src/cors.js')>('../src/cors.js', {
      ...GOOD,
      CORS_ORIGINS: 'https://app.example.com, http://localhost:3000',
    });
    const app = express();
    app.use(cors(corsOptions));
    app.get('/ping', (_req, res) => {
      res.json({ ok: true });
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('echoes an allowed origin and ignores any other', async () => {
    await start();
    const allowed = await fetch(`${base}/ping`, { headers: { Origin: 'https://app.example.com' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.com');

    const evil = await fetch(`${base}/ping`, { headers: { Origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
