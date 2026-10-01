import { Request, Response, NextFunction } from 'express';
import { query } from '../database.js';

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey || req.method !== 'POST') {
    next();
    return;
  }

  const userId = req.user?.id || 'anonymous';
  const endpoint = `${req.method} ${req.baseUrl}${req.path}`;

  try {
    const existing = await query(
      'SELECT response FROM idempotency_records WHERE key = $1 AND user_id = $2',
      [idempotencyKey, userId]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const cached = existing.rows[0].response;
      res.setHeader('X-Cache-Lookup', 'HIT');
      res.status(cached.status || 200).json(cached.body);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Async store without blocking response
      query(
        `INSERT INTO idempotency_records (key, user_id, endpoint, response)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO NOTHING`,
        [idempotencyKey, userId, endpoint, JSON.stringify({ status: res.statusCode, body })]
      ).catch((err) => {
        console.error('[Idempotency] Failed to save record', err);
      });

      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('[Idempotency] Middleware error', error);
    next();
  }
}
