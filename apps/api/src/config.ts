import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://postgres@127.0.0.1:5433/event_platform'),
  JWT_SECRET: z.string().default('super-secret-jwt-key-2026-secure'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  QR_HMAC_SECRET: z.string().default('hmac-qr-signing-key-production-ready-2026'),
  BOOKING_STRATEGY: z.enum(['pessimistic', 'conditional', 'naive']).default('pessimistic'),
  DEFAULT_HOLD_MINUTES: z.coerce.number().default(10),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().default('development'),
  ENABLE_SIMULATION: z.string().optional(),
  DEMO_MODE: z.string().optional(),
  // Bootstrap ADMIN created on an empty database when demo mode is off.
  ADMIN_EMAIL: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'ADMIN_EMAIL must be an email address'),
  ADMIN_PASSWORD: z
    .string()
    .optional()
    .refine((v) => !v || v.length >= 12, 'ADMIN_PASSWORD must be at least 12 characters'),
});

const env = envSchema.parse(process.env);

/** Lenient boolean env flag: true/1/yes/on; blank or missing falls back to the default. */
function flag(value: string | undefined, fallback: boolean): boolean {
  const v = value?.trim().toLowerCase();
  return v ? ['true', '1', 'yes', 'on'].includes(v) : fallback;
}

// Demo mode seeds well-known demo accounts (password123) and sample events, so it is only on
// by default in development/test; anywhere else it needs DEMO_MODE=true.
const demoMode = flag(env.DEMO_MODE, ['development', 'test'].includes(env.NODE_ENV));

export const config = {
  ...env,
  DEMO_MODE_ENABLED: demoMode,
  // The concurrency lab (/admin/simulate/*) deletes tickets and resets seats: it follows demo mode
  // unless ENABLE_SIMULATION says otherwise.
  SIMULATION_ENABLED: flag(env.ENABLE_SIMULATION, demoMode),
};
