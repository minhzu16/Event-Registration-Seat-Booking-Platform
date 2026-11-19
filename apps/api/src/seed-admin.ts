import bcrypt from 'bcryptjs';
import { query } from './database.js';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Outside demo mode no well-known demo accounts are created. The only bootstrap account is an
 * ADMIN whose credentials come from ADMIN_EMAIL / ADMIN_PASSWORD; without them nothing is created.
 * Call only on an empty users table.
 */
export async function bootstrapAdmin(): Promise<boolean> {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    logger.warn('[Seed] DEMO_MODE is off and ADMIN_EMAIL / ADMIN_PASSWORD are not set: no accounts were created.');
    return false;
  }

  const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12);
  await query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, 'Administrator', 'ADMIN');`,
    [config.ADMIN_EMAIL, passwordHash]
  );
  logger.info('[Seed] Created the bootstrap ADMIN account from ADMIN_EMAIL');
  return true;
}
