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
});

export const config = envSchema.parse(process.env);
