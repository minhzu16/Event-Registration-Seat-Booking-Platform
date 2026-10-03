import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';
import { DatabaseError } from './errors.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, '[DB] Unexpected error on idle client');
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 150) {
      logger.warn(
        { query: text.substring(0, 150), durationMs: duration, rowCount: res.rowCount },
        '[DB SLOW QUERY]'
      );
    }
    return res;
  } catch (error: any) {
    logger.error(
      { query: text.substring(0, 150), params, err: error.message },
      '[DB Query Error]'
    );
    throw new DatabaseError(error.message, error);
  }
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Guard against runaway locked transactions
    await client.query('SET statement_timeout = 10000');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      logger.error({ err: rbErr }, '[DB] Rollback failed');
    }
    throw error;
  } finally {
    client.release();
  }
}
