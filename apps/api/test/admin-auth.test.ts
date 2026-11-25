import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// No real database: every rejection must happen before a single query runs.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database.js', () => ({ query, withTransaction: vi.fn(), pool: {} }));

const SECRET = 'admin-route-guard-test-secret-0123456789abcdef';
const ENV_KEYS = ['JWT_SECRET', 'NODE_ENV', 'ENABLE_SIMULATION', 'DEMO_MODE'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const ROLE_LOOKUP = 'SELECT role FROM users WHERE id = $1';
const dbRoles = new Map<string, string>();

type Env = Partial<Record<(typeof ENV_KEYS)[number], string>>;

/** Boots a bare app with the auth and admin routers, re-reading config from the given env. */
async function startApp(env: Env): Promise<{ server: Server; base: string }> {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    // Blank instead of delete: dotenv only fills absent keys, so a local .env can't leak in.
    process.env[key] = env[key] ?? '';
  }
  const { default: authRoutes } = await import('../src/routes/auth.routes.js');
  const { default: adminRoutes } = await import('../src/routes/admin.routes.js');
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/', adminRoutes);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

function tokenFor(role: string, secret = SECRET, claims: Record<string, unknown> = {}): string {
  const id = (claims.id as string | undefined) ?? randomUUID();
  dbRoles.set(id, role);
  return jwt.sign({ id, email: `${role.toLowerCase()}@test.local`, role, fullName: role, ...claims }, secret);
}

function auth(token?: string): Record<string, string> {
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

const ticketDrop = (base: string, token?: string, body: unknown = {
  sessionId: randomUUID(),
  targetSeatIds: [randomUUID()],
  concurrentRequests: 1,
  strategy: 'pessimistic',
}) => fetch(`${base}/admin/simulate/ticket-drop`, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });

const integrity = (base: string, token?: string) =>
  fetch(`${base}/admin/integrity/${randomUUID()}`, { headers: auth(token) });

/** Business SQL only: ignores the auth role lookup. */
const businessCalls = () => query.mock.calls.filter(([sql]) => sql !== ROLE_LOOKUP);

beforeEach(() => {
  query.mockReset();
  dbRoles.clear();
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql === ROLE_LOOKUP) {
      const role = dbRoles.get(String(params?.[0]));
      return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('Admin routes require an authenticated ADMIN', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    ({ server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'development' }));
  });
  afterAll(() => {
    server.close();
  });

  it('rejects an anonymous ticket drop with 401 and runs no SQL', async () => {
    const res = await ticketDrop(base);
    expect(res.status).toBe(401);
    expect(businessCalls()).toHaveLength(0);
  });

  it('rejects an anonymous integrity scan with 401', async () => {
    const res = await integrity(base);
    expect(res.status).toBe(401);
    expect(businessCalls()).toHaveLength(0);
  });

  it('rejects a token signed with another secret with 401', async () => {
    const res = await ticketDrop(base, tokenFor('ADMIN', 'attacker-chosen-secret'));
    expect(res.status).toBe(401);
    expect(businessCalls()).toHaveLength(0);
  });

  it('rejects an expired ADMIN token with 401', async () => {
    const expired = tokenFor('ADMIN', SECRET, { exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await ticketDrop(base, expired);
    expect(res.status).toBe(401);
    expect(businessCalls()).toHaveLength(0);
  });

  it.each(['ATTENDEE', 'ORGANISER', 'STAFF'])('forbids %s with 403 and runs no SQL', async (role) => {
    const token = tokenFor(role);
    expect((await ticketDrop(base, token)).status).toBe(403);
    expect((await integrity(base, token)).status).toBe(403);
    expect(businessCalls()).toHaveLength(0);
  });

  it('forbids an ADMIN token whose DB role was changed to ATTENDEE with 403 on the integrity scan', async () => {
    const id = randomUUID();
    const token = tokenFor('ADMIN', SECRET, { id });
    dbRoles.set(id, 'ATTENDEE');
    const res = await integrity(base, token);
    expect(res.status).toBe(403);
    expect(businessCalls()).toHaveLength(0);
  });

  it('rejects a token for an id missing from dbRoles with 401 on the integrity scan', async () => {
    const id = randomUUID();
    const token = tokenFor('ADMIN', SECRET, { id });
    dbRoles.delete(id);
    const res = await integrity(base, token);
    expect(res.status).toBe(401);
    expect(businessCalls()).toHaveLength(0);
  });

  it('lets ADMIN run the integrity scan', async () => {
    const res = await integrity(base, tokenFor('ADMIN'));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('PASSED');
  });

  it('lets ADMIN reach the ticket-drop handler (invalid body -> 400, not 401/403)', async () => {
    const res = await ticketDrop(base, tokenFor('ADMIN'), { sessionId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);
  });

  it('rejects a malformed session id on the integrity scan with 400 instead of a SQL error', async () => {
    const res = await fetch(`${base}/admin/integrity/not-a-uuid`, { headers: auth(tokenFor('ADMIN')) });
    expect(res.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);
  });
});

describe('Self-registration cannot grant privileged roles', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    ({ server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'development' }));
  });
  afterAll(() => {
    server.close();
  });

  const register = (body: Record<string, unknown>) =>
    fetch(`${base}/auth/register`, { method: 'POST', headers: auth(), body: JSON.stringify(body) });

  it.each(['ADMIN', 'STAFF'])('rejects sign-up as %s with 400 and writes nothing', async (role) => {
    const res = await register({ email: 'mallory@test.local', password: 'password123', fullName: 'Mallory', role });
    expect(res.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);
  });

  it('still lets visitors sign up as ATTENDEE', async () => {
    const answers = [
      { rows: [], rowCount: 0 },
      {
        rows: [{ id: randomUUID(), email: 'new@test.local', full_name: 'New User', role: 'ATTENDEE' }],
        rowCount: 1,
      },
    ];
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      return answers.shift() ?? { rows: [], rowCount: 0 };
    });
    const res = await register({ email: 'new@test.local', password: 'password123', fullName: 'New User' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.role).toBe('ATTENDEE');
    expect(body).not.toHaveProperty('refreshToken');
    expect(body.refreshToken).toBeUndefined();
    expect(res.headers.get('set-cookie')).toContain('refreshToken=');
  });
});

describe('Concurrency lab is off in production unless explicitly enabled', () => {
  it('returns 404 to ADMIN when NODE_ENV=production and runs no SQL', async () => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'production' });
    try {
      const res = await ticketDrop(base, tokenFor('ADMIN'));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('SIMULATION_DISABLED');
      expect(businessCalls()).toHaveLength(0);
    } finally {
      server.close();
    }
  });

  it('keeps the read-only integrity scan available to ADMIN in production', async () => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'production' });
    try {
      expect((await integrity(base, tokenFor('ADMIN'))).status).toBe(200);
    } finally {
      server.close();
    }
  });

  it('stays off for any other environment name, e.g. NODE_ENV=staging (fail-closed)', async () => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'staging' });
    try {
      expect((await ticketDrop(base, tokenFor('ADMIN'))).status).toBe(404);
    } finally {
      server.close();
    }
  });

  it.each(['true', '1', 'TRUE', ' yes '])('can be re-enabled in production with ENABLE_SIMULATION=%j', async (flag) => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'production', ENABLE_SIMULATION: flag });
    try {
      const res = await ticketDrop(base, tokenFor('ADMIN'), { sessionId: 'not-a-uuid' });
      expect(res.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it('treats a blank ENABLE_SIMULATION as unset instead of crashing on boot', async () => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'production', ENABLE_SIMULATION: '' });
    try {
      expect((await ticketDrop(base, tokenFor('ADMIN'))).status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('can be switched off outside production with ENABLE_SIMULATION=false', async () => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'development', ENABLE_SIMULATION: 'false' });
    try {
      expect((await ticketDrop(base, tokenFor('ADMIN'))).status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('supports silent refresh via /auth/refresh and clearing cookie via /auth/logout', async () => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'development' });
    try {
      const id = randomUUID();
      dbRoles.set(id, 'ATTENDEE');
      query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM users WHERE id = $1')) {
          return { rows: [{ id, email: 'attendee@test.local', full_name: 'Attendee', role: 'ATTENDEE' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const refreshToken = jwt.sign({ id, typ: 'refresh' }, SECRET, { expiresIn: '7d' });

      // Refresh with token in body or Cookie header
      const refreshRes = await fetch(`${base}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `refreshToken=${refreshToken}` },
      });
      expect(refreshRes.status).toBe(200);
      const data = (await refreshRes.json()) as { accessToken: string; token: string; user: { id: string }; refreshToken?: string };
      expect(data.token).toBeDefined();
      expect(data.user.id).toBe(id);
      expect(data.refreshToken).toBeUndefined();
      expect(refreshRes.headers.get('set-cookie')).toContain('refreshToken=');

      // Logout clears cookie
      const logoutRes = await fetch(`${base}/auth/logout`, { method: 'POST' });
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.headers.get('set-cookie')).toContain('refreshToken=;');
    } finally {
      server.close();
    }
  });

  it('login JSON response does not contain refreshToken and sets refreshToken cookie', async () => {
    const { server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'development' });
    try {
      const id = randomUUID();
      const passwordHash = await bcrypt.hash('password123', 10);
      query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM users WHERE email = $1')) {
          return {
            rows: [{ id, email: 'attendee@test.local', password_hash: passwordHash, full_name: 'Attendee', role: 'ATTENDEE' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const loginRes = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'attendee@test.local', password: 'password123' }),
      });
      expect(loginRes.status).toBe(200);
      const loginData = (await loginRes.json()) as Record<string, unknown>;
      expect(loginData.token).toBeDefined();
      expect(loginData).not.toHaveProperty('refreshToken');
      expect(loginData.refreshToken).toBeUndefined();
      expect(loginRes.headers.get('set-cookie')).toContain('refreshToken=');
    } finally {
      server.close();
    }
  });
});
