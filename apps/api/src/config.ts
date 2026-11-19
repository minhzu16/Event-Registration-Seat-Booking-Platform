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
});

const env = envSchema.parse(process.env);
const simulationFlag = env.ENABLE_SIMULATION?.trim().toLowerCase();

export const config = {
  ...env,
  // The concurrency lab (/admin/simulate/*) deletes tickets and resets seats, so it is only on
  // by default in development/test; anywhere else it needs ENABLE_SIMULATION=true (or 1/yes/on).
  SIMULATION_ENABLED: simulationFlag
    ? ['true', '1', 'yes', 'on'].includes(simulationFlag)
    : ['development', 'test'].includes(env.NODE_ENV),
};
