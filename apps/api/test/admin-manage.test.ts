import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// No real database: every rejection must happen before a single query runs.
const { query, pool } = vi.hoisted(() => {
  const query = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  };
  return { query, pool };
});
vi.mock('../src/database.js', () => ({ query, withTransaction: vi.fn(), pool }));

const SECRET = 'admin-route-guard-test-secret-0123456789abcdef';
const ENV_KEYS = ['JWT_SECRET', 'NODE_ENV', 'ENABLE_SIMULATION', 'DEMO_MODE'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

type Env = Partial<Record<(typeof ENV_KEYS)[number], string>>;

const ROLE_LOOKUP = 'SELECT role FROM users WHERE id = $1';
const dbRoles = new Map<string, string>();

/** Business SQL only: ignores the auth role lookup. */
const businessCalls = () => query.mock.calls.filter(([sql]) => sql !== ROLE_LOOKUP);

/** Boots a bare app with the admin-manage router, re-reading config from the given env. */
async function startApp(env: Env): Promise<{ server: Server; base: string }> {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    // Blank instead of delete: dotenv only fills absent keys, so a local .env can't leak in.
    process.env[key] = env[key] ?? '';
  }
  const { default: adminManageRoutes } = await import('../src/routes/admin-manage.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/', adminManageRoutes);
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

describe('admin-manage routes', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    ({ server, base } = await startApp({ JWT_SECRET: SECRET, NODE_ENV: 'development' }));
  });

  afterAll(() => {
    server.close();
  });

  // 1. For each of GET /admin/stats, GET /admin/users, PATCH /admin/users/<uuid>/role, GET /admin/events, PATCH /admin/events/<uuid>/status:
  //    no token → 401; ATTENDEE token → 403; and query was never called.
  const protectedEndpoints = [
    { name: 'GET /admin/stats', method: 'GET', getPath: () => '/admin/stats', body: undefined },
    { name: 'GET /admin/users', method: 'GET', getPath: () => '/admin/users', body: undefined },
    { name: 'PATCH /admin/users/<uuid>/role', method: 'PATCH', getPath: () => `/admin/users/${randomUUID()}/role`, body: { role: 'STAFF' } },
    { name: 'GET /admin/events', method: 'GET', getPath: () => '/admin/events', body: undefined },
    { name: 'PATCH /admin/events/<uuid>/status', method: 'PATCH', getPath: () => `/admin/events/${randomUUID()}/status`, body: { status: 'CANCELLED' } },
  ];

  it.each(protectedEndpoints)('$name requires ADMIN token (no token -> 401, ATTENDEE -> 403, no business query called)', async ({ method, getPath, body }) => {
    const path = getPath();
    const payload = body ? JSON.stringify(body) : undefined;

    // No token -> 401
    const noTokenRes = await fetch(`${base}${path}`, {
      method,
      headers: auth(),
      body: payload,
    });
    expect(noTokenRes.status).toBe(401);
    expect(businessCalls()).toHaveLength(0);

    // ATTENDEE token -> 403
    const attendeeRes = await fetch(`${base}${path}`, {
      method,
      headers: auth(tokenFor('ATTENDEE')),
      body: payload,
    });
    expect(attendeeRes.status).toBe(403);
    expect(businessCalls()).toHaveLength(0);
  });

  // 2. GET /admin/users?search=ali with ADMIN: mock query to resolve
  //    { rows: [{ id: 'u1', email: 'a@x.io', full_name: 'Ali', role: 'ATTENDEE', phone: null, created_at: '2026-01-01', total: 1, password_hash: 'SHOULD_NOT_LEAK' }] }.
  //    Expect 200, body.items[0] equals { id: 'u1', email: 'a@x.io', fullName: 'Ali', role: 'ATTENDEE', phone: null, createdAt: '2026-01-01' },
  //    JSON text does not contain SHOULD_NOT_LEAK, the SQL (first arg of the call) does not contain password_hash, and params[0] === '%ali%'.
  it('GET /admin/users?search=ali with ADMIN filters correctly and does not leak password_hash', async () => {
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      return {
        rows: [
          {
            id: 'u1',
            email: 'a@x.io',
            full_name: 'Ali',
            role: 'ATTENDEE',
            phone: null,
            created_at: '2026-01-01',
            total: 1,
            password_hash: 'SHOULD_NOT_LEAK',
          },
        ],
        rowCount: 1,
      };
    });

    const res = await fetch(`${base}/admin/users?search=ali`, {
      headers: auth(tokenFor('ADMIN')),
    });
    expect(res.status).toBe(200);

    const rawText = await res.text();
    expect(rawText).not.toContain('SHOULD_NOT_LEAK');

    const body = JSON.parse(rawText);
    expect(body.items[0]).toEqual({
      id: 'u1',
      email: 'a@x.io',
      fullName: 'Ali',
      role: 'ATTENDEE',
      phone: null,
      createdAt: '2026-01-01',
    });

    expect(businessCalls()).toHaveLength(1);
    const [sql, params] = businessCalls()[0];
    expect(sql).not.toContain('password_hash');
    expect(params[0]).toBe('%ali%');
  });

  // 3. GET /admin/users?role=HACKER → 400, query not called. GET /admin/users?pageSize=1000 → 400.
  it('GET /admin/users validates role and pageSize', async () => {
    const resRole = await fetch(`${base}/admin/users?role=HACKER`, {
      headers: auth(tokenFor('ADMIN')),
    });
    expect(resRole.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);

    const resPageSize = await fetch(`${base}/admin/users?pageSize=1000`, {
      headers: auth(tokenFor('ADMIN')),
    });
    expect(resPageSize.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);
  });

  // 4. PATCH /admin/users/<caller id>/role with ADMIN token whose id claim is that same uuid → 400, query not called.
  it('PATCH /admin/users/<caller id>/role rejects changing own role with 400', async () => {
    const callerId = randomUUID();
    const token = tokenFor('ADMIN', SECRET, { id: callerId });
    const res = await fetch(`${base}/admin/users/${callerId}/role`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ role: 'STAFF' }),
    });
    expect(res.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);
  });

  // 5. PATCH /admin/users/<other uuid>/role body {role:'GOD'} → 400; body {role:'STAFF'} with query resolving { rows: [] } → 404;
  //    with a row → 200 and camelCase body.
  it('PATCH /admin/users/<other uuid>/role handles invalid role, user not found, and successful update', async () => {
    const otherUuid = randomUUID();
    const token = tokenFor('ADMIN');

    // body { role: 'GOD' } -> 400
    const resGod = await fetch(`${base}/admin/users/${otherUuid}/role`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ role: 'GOD' }),
    });
    expect(resGod.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);

    // body { role: 'STAFF' } with query resolving { rows: [] } -> 404
    const resNotFound = await fetch(`${base}/admin/users/${otherUuid}/role`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ role: 'STAFF' }),
    });
    expect(resNotFound.status).toBe(404);

    // with a row -> 200 and camelCase body
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ role: 'ATTENDEE' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE users SET role = $1')) {
        return {
          rows: [
            {
              id: otherUuid,
              email: 'staff@example.com',
              full_name: 'Staff User',
              role: 'STAFF',
              phone: null,
              created_at: '2026-01-01',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const resSuccess = await fetch(`${base}/admin/users/${otherUuid}/role`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ role: 'STAFF' }),
    });
    expect(resSuccess.status).toBe(200);
    const data = await resSuccess.json();
    expect(data).toEqual({
      id: otherUuid,
      email: 'staff@example.com',
      fullName: 'Staff User',
      role: 'STAFF',
      phone: null,
      createdAt: '2026-01-01',
    });
  });

  // 6. PATCH /admin/users/not-a-uuid/role → 400.
  it('PATCH /admin/users/not-a-uuid/role rejects non-uuid id with 400', async () => {
    const res = await fetch(`${base}/admin/users/not-a-uuid/role`, {
      method: 'PATCH',
      headers: auth(tokenFor('ADMIN')),
      body: JSON.stringify({ role: 'STAFF' }),
    });
    expect(res.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);
  });

  // 7. PATCH /admin/events/<uuid>/status {status:'ARCHIVED'} → 400; {status:'CANCELLED'} with row { id, status:'CANCELLED', version: 3 } → 200 same body.
  it('PATCH /admin/events/<uuid>/status handles invalid status and valid update', async () => {
    const eventId = randomUUID();
    const token = tokenFor('ADMIN');

    // { status: 'ARCHIVED' } -> 400
    const resArchived = await fetch(`${base}/admin/events/${eventId}/status`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ status: 'ARCHIVED' }),
    });
    expect(resArchived.status).toBe(400);
    expect(businessCalls()).toHaveLength(0);

    // { status: 'CANCELLED' } with row { id, status: 'CANCELLED', version: 3 } -> 200 same body
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      return {
        rows: [{ id: eventId, status: 'CANCELLED', version: 3 }],
        rowCount: 1,
      };
    });
    const resCancelled = await fetch(`${base}/admin/events/${eventId}/status`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    expect(resCancelled.status).toBe(200);
    const data = await resCancelled.json();
    expect(data).toEqual({ id: eventId, status: 'CANCELLED', version: 3 });
  });

  // 8. GET /admin/stats: mock the 4 Promise.all queries in order with string numbers (e.g. { rows: [{ role:'ADMIN', n:'2' }] }, ...,
  //    { rows: [{ confirmed:'5', revenue30d:'1200.50' }] }, { rows: [{ active:'7' }] }) → body numbers are numbers
  //    (users.byRole.ADMIN === 2, users.byRole.ATTENDEE === 0, bookings.revenue30d === 1200.5, tickets.active === 7).
  //    Use query.mockResolvedValueOnce four times in the order the route calls them (read the route).
  it('GET /admin/stats parses query count aggregates as numbers', async () => {
    const answers = [
      // 1. usersRes: SELECT role, count(*)::int AS n FROM users GROUP BY role
      { rows: [{ role: 'ADMIN', n: '2' }] },
      // 2. eventsRes: SELECT status, count(*)::int AS n FROM events GROUP BY status
      { rows: [{ status: 'PUBLISHED', n: '3' }] },
      // 3. bookingsRes: SELECT count(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed, COALESCE(sum(total_amount)...) AS revenue30d FROM bookings
      { rows: [{ confirmed: '5', revenue30d: '1200.50' }] },
      // 4. ticketsRes: SELECT count(*)::int AS active FROM tickets WHERE status = 'ACTIVE'
      { rows: [{ active: '7' }] },
    ];
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      return answers.shift() ?? { rows: [], rowCount: 0 };
    });

    const res = await fetch(`${base}/admin/stats`, {
      headers: auth(tokenFor('ADMIN')),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.users.byRole.ADMIN).toBe(2);
    expect(body.users.byRole.ATTENDEE).toBe(0);
    expect(body.bookings.revenue30d).toBe(1200.5);
    expect(body.tickets.active).toBe(7);
  });

  // 9. search a_b binds the parameter %a\_b%
  it('GET /admin/users?search=a_b binds parameter with escaped like characters', async () => {
    const res = await fetch(`${base}/admin/users?search=a_b`, {
      headers: auth(tokenFor('ADMIN')),
    });
    expect(res.status).toBe(200);
    expect(businessCalls()).toHaveLength(1);
    const [, params] = businessCalls()[0];
    expect(params[0]).toBe('%a\\_b%');
  });

  // 10. page 3 with no rows but matches -> response total comes from the second count query
  it('GET /admin/users on page 3 with no rows returns total from second count query', async () => {
    const answers = [
      { rows: [], rowCount: 0 },
      { rows: [{ total: 42 }], rowCount: 1 },
    ];
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      return answers.shift() ?? { rows: [], rowCount: 0 };
    });

    const res = await fetch(`${base}/admin/users?page=3`, {
      headers: auth(tokenFor('ADMIN')),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(3);
    expect(body.items).toEqual([]);
    expect(body.total).toBe(42);
    expect(businessCalls()).toHaveLength(2);
    expect(businessCalls()[1][0]).toContain('count(*)::int AS total');
  });

  // 11. demoting the only ADMIN -> 400; demoting when another ADMIN exists -> 200
  it('demoting the only ADMIN returns 400; demoting when another ADMIN exists returns 200', async () => {
    const callerId = randomUUID();
    const token = tokenFor('ADMIN', SECRET, { id: callerId });
    const targetId = randomUUID();

    // 1. Demoting the only ADMIN -> 400
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ role: 'ADMIN' }], rowCount: 1 };
      }
      if (sql.includes("count(*)::int AS n FROM users WHERE role = 'ADMIN'")) {
        return { rows: [{ n: 0 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const resDemoteOnly = await fetch(`${base}/admin/users/${targetId}/role`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ role: 'STAFF' }),
    });
    expect(resDemoteOnly.status).toBe(400);
    const bodyOnly = await resDemoteOnly.json();
    expect(bodyOnly.message).toBe('At least one ADMIN must remain');

    // 2. Demoting when another ADMIN exists -> 200
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === ROLE_LOOKUP) {
        const role = dbRoles.get(String(params?.[0]));
        return { rows: role ? [{ role }] : [], rowCount: role ? 1 : 0 };
      }
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ role: 'ADMIN' }], rowCount: 1 };
      }
      if (sql.includes("count(*)::int AS n FROM users WHERE role = 'ADMIN'")) {
        return { rows: [{ n: 1 }], rowCount: 1 };
      }
      if (sql.includes('UPDATE users SET role = $1')) {
        return {
          rows: [
            {
              id: targetId,
              email: 'demoted@test.local',
              full_name: 'Demoted Admin',
              role: 'STAFF',
              phone: null,
              created_at: '2026-01-01',
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const resDemoteWithOther = await fetch(`${base}/admin/users/${targetId}/role`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ role: 'STAFF' }),
    });
    expect(resDemoteWithOther.status).toBe(200);
    const bodySuccess = await resDemoteWithOther.json();
    expect(bodySuccess.role).toBe('STAFF');
    expect(bodySuccess.id).toBe(targetId);
  });

  // 12. token role ADMIN but DB role ATTENDEE -> 403 on GET /admin/stats
  it('token role ADMIN but DB role ATTENDEE returns 403 on GET /admin/stats', async () => {
    const userId = randomUUID();
    const token = tokenFor('ADMIN', SECRET, { id: userId });
    dbRoles.set(userId, 'ATTENDEE');

    const res = await fetch(`${base}/admin/stats`, {
      headers: auth(token),
    });
    expect(res.status).toBe(403);
    expect(businessCalls()).toHaveLength(0);
  });

  // 13. token for a user that no longer exists -> 401
  it('token for a user that no longer exists returns 401', async () => {
    const userId = randomUUID();
    const token = tokenFor('ADMIN', SECRET, { id: userId });
    dbRoles.delete(userId);

    const res = await fetch(`${base}/admin/stats`, {
      headers: auth(token),
    });
    expect(res.status).toBe(401);
    expect(businessCalls()).toHaveLength(0);
  });
});
