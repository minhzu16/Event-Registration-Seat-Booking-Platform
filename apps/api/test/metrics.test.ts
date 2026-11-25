import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createMetricsHandler,
  metricsMiddleware,
  metricsRegistry,
} from '../src/metrics.js';

describe('Prometheus /metrics endpoint and HTTP metrics middleware', () => {
  let server: Server;
  let baseUrl: string;
  const originalToken = process.env.METRICS_TOKEN;

  beforeAll(async () => {
    const app = express();
    app.use(metricsMiddleware);
    app.get('/metrics', createMetricsHandler({ getActiveHolds: async () => 3 }));
    app.get('/events/:id', (req, res) => {
      res.json({ id: req.params.id });
    });

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    delete process.env.METRICS_TOKEN;
    metricsRegistry.resetMetrics();
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = originalToken;
    server?.close();
  });

  it('serves Prometheus default metrics, HTTP counters/histograms, and custom gauges when METRICS_TOKEN is unset', async () => {
    await fetch(`${baseUrl}/events/123`);
    const res = await fetch(`${baseUrl}/metrics`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const body = await res.text();
    expect(body).toContain('process_cpu_');
    expect(body).toContain('http_requests_total');
    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('route="/events/:id"');
    expect(body).toContain('seatlock_uptime_seconds');
    expect(body).toContain('seatlock_active_holds_total 3');
  });

  it('labels unmatched 404 routes as route="unmatched"', async () => {
    const notFoundRes = await fetch(`${baseUrl}/does-not-exist-xyz`);
    expect(notFoundRes.status).toBe(404);

    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();
    expect(body).toContain('route="unmatched"');
    expect(body).toContain('status_code="404"');
  });

  it('enforces METRICS_TOKEN bearer auth when set', async () => {
    process.env.METRICS_TOKEN = 'secret-metrics-token-123';

    const unauth = await fetch(`${baseUrl}/metrics`);
    expect(unauth.status).toBe(401);

    const wrong = await fetch(`${baseUrl}/metrics`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(wrong.status).toBe(401);

    const ok = await fetch(`${baseUrl}/metrics`, {
      headers: { Authorization: 'Bearer secret-metrics-token-123' },
    });
    expect(ok.status).toBe(200);
  });
});
