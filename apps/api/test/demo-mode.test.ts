import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database.js', () => ({ query, withTransaction: vi.fn(), pool: {} }));
vi.mock('../src/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const ENV_KEYS = ['NODE_ENV', 'DEMO_MODE', 'ENABLE_SIMULATION', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'] as const;
type Env = Partial<Record<(typeof ENV_KEYS)[number], string>>;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

/** Re-imports a module after setting the env (blank instead of delete so a local .env can't leak in). */
async function load<T>(path: string, env: Env): Promise<T> {
  vi.resetModules();
  for (const key of ENV_KEYS) process.env[key] = env[key] ?? '';
  return import(path) as Promise<T>;
}

type ConfigModule = typeof import('../src/config.js');
type SeedModule = typeof import('../src/seed-admin.js');

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 1 });
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('DEMO_MODE defaults (demo accounts share the public password "password123")', () => {
  it.each([
    ['development', true],
    ['test', true],
    ['production', false],
    ['staging', false],
  ])('NODE_ENV=%s -> demo mode %s', async (nodeEnv, expected) => {
    const { config } = await load<ConfigModule>('../src/config.js', { NODE_ENV: nodeEnv });
    expect(config.DEMO_MODE_ENABLED).toBe(expected);
    expect(config.SIMULATION_ENABLED).toBe(expected);
  });

  it('can be switched on for a public demo deployment, which also enables the lab', async () => {
    const { config } = await load<ConfigModule>('../src/config.js', { NODE_ENV: 'production', DEMO_MODE: 'true' });
    expect(config.DEMO_MODE_ENABLED).toBe(true);
    expect(config.SIMULATION_ENABLED).toBe(true);
  });

  it('lets ENABLE_SIMULATION=false turn the lab off even in demo mode', async () => {
    const { config } = await load<ConfigModule>('../src/config.js', { NODE_ENV: 'development', ENABLE_SIMULATION: 'false' });
    expect(config.DEMO_MODE_ENABLED).toBe(true);
    expect(config.SIMULATION_ENABLED).toBe(false);
  });

  it('refuses to boot with a short ADMIN_PASSWORD', async () => {
    await expect(
      load<ConfigModule>('../src/config.js', { NODE_ENV: 'production', ADMIN_EMAIL: 'ops@example.com', ADMIN_PASSWORD: 'short' })
    ).rejects.toThrow(/ADMIN_PASSWORD/);
  });
});

describe('bootstrapAdmin (empty database, demo mode off)', () => {
  it('creates no account at all without ADMIN_EMAIL / ADMIN_PASSWORD', async () => {
    const { bootstrapAdmin } = await load<SeedModule>('../src/seed-admin.js', { NODE_ENV: 'production' });
    expect(await bootstrapAdmin()).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('creates exactly one ADMIN with the configured password, bcrypt-hashed', async () => {
    const password = 'correct-horse-battery-staple';
    const { bootstrapAdmin } = await load<SeedModule>('../src/seed-admin.js', {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'ops@example.com',
      ADMIN_PASSWORD: password,
    });

    expect(await bootstrapAdmin()).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, [email, hash]] = query.mock.calls[0] as [string, [string, string]];
    expect(sql).toContain("'ADMIN'");
    expect(email).toBe('ops@example.com');
    expect(hash).not.toContain(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(await bcrypt.compare('password123', hash)).toBe(false);
  });
});
