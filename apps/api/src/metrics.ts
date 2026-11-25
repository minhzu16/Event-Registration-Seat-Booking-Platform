import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { pool, query } from './database.js';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

const uptimeGauge = new Gauge({
  name: 'seatlock_uptime_seconds',
  help: 'Process uptime in seconds.',
  registers: [metricsRegistry],
});

const poolTotalGauge = new Gauge({
  name: 'seatlock_db_pool_total_connections',
  help: 'Total pool connection limit.',
  registers: [metricsRegistry],
});

const poolIdleGauge = new Gauge({
  name: 'seatlock_db_pool_idle_connections',
  help: 'Idle connections in pool.',
  registers: [metricsRegistry],
});

const poolWaitingGauge = new Gauge({
  name: 'seatlock_db_pool_waiting_requests',
  help: 'Client queries waiting for a connection.',
  registers: [metricsRegistry],
});

const activeHoldsGauge = new Gauge({
  name: 'seatlock_active_holds_total',
  help: 'Number of currently active non-expired seat holds.',
  registers: [metricsRegistry],
});

/** Constant-time comparison so METRICS_TOKEN cannot be guessed from response timing. */
function tokenMatches(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Records HTTP request counts and latency histograms; labels unmatched 404s as "unmatched". */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') {
    next();
    return;
  }

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const matchedRoute = req.route?.path
      ? `${req.baseUrl || ''}${String(req.route.path)}`
      : null;
    const route = matchedRoute ?? (res.statusCode === 404 ? 'unmatched' : req.path || 'unknown');
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSec);
  });

  next();
}

export interface MetricsHandlerOptions {
  getActiveHolds?: () => Promise<number>;
}

async function defaultGetActiveHolds(): Promise<number> {
  const res = await query('SELECT count(*) as count FROM holds WHERE expires_at > now()');
  return Number(res.rows[0]?.count || 0);
}

/** Express handler for GET /metrics with optional METRICS_TOKEN bearer protection. */
export function createMetricsHandler(options: MetricsHandlerOptions = {}) {
  const getActiveHolds = options.getActiveHolds ?? defaultGetActiveHolds;

  return async (req: Request, res: Response): Promise<void> => {
    const requiredToken = process.env.METRICS_TOKEN;
    if (requiredToken && !tokenMatches(req.headers.authorization, requiredToken)) {
      res.status(401).send('Unauthorized: Invalid or missing metrics token');
      return;
    }

    try {
      uptimeGauge.set(Number(process.uptime().toFixed(2)));
      poolTotalGauge.set(pool.totalCount);
      poolIdleGauge.set(pool.idleCount);
      poolWaitingGauge.set(pool.waitingCount);
      activeHoldsGauge.set(await getActiveHolds());

      res.setHeader('Content-Type', metricsRegistry.contentType);
      res.send(await metricsRegistry.metrics());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).send(`# Error generating metrics: ${msg}`);
    }
  };
}
