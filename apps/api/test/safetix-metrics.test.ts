import { describe, it, expect } from 'vitest';
import {
  generateRollingPassCode,
  verifyRollingPassCode,
  verifyAnyPass,
  signTicketCode,
} from '../src/services/qr.js';

const API_BASE = 'http://localhost:4000';

describe('SafeTix™ Anti-Scalping Rolling Pass & Production Observability Tests', () => {
  const dummyTicketId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('Generates valid SafeTix rolling pass with ROLL. prefix and 15s window', () => {
    const pass = generateRollingPassCode(dummyTicketId, 15);
    expect(pass.code.startsWith('ROLL.')).toBe(true);
    expect(pass.remainingSeconds).toBeGreaterThanOrEqual(1);
    expect(pass.remainingSeconds).toBeLessThanOrEqual(15);
  });

  it('Verifies dynamic rolling pass successfully in current time window', () => {
    const pass = generateRollingPassCode(dummyTicketId, 15);
    const result = verifyRollingPassCode(pass.code, 15);
    expect(result.valid).toBe(true);
    expect(result.ticketId).toBe(dummyTicketId);
  });

  it('Rejects expired rolling pass (screenshot taken from old window)', () => {
    // Simulate screenshot taken 5 windows ago (75 seconds in the past)
    const oldWindow = Math.floor(Date.now() / 1000 / 15) - 5;
    const encodedId = Buffer.from(dummyTicketId).toString('base64url');
    const fakeOldCode = `ROLL.${encodedId}.${oldWindow}.someoldsig1234567`;

    const result = verifyRollingPassCode(fakeOldCode, 15);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('EXPIRED_ROLLING_TOKEN');
  });

  it('Rejects tampered signature on rolling pass', () => {
    const pass = generateRollingPassCode(dummyTicketId, 15);
    const tamperedCode = pass.code.slice(0, -4) + 'XXXX';
    const result = verifyRollingPassCode(tamperedCode, 15);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('TAMPERED_SIGNATURE');
  });

  it('verifyAnyPass seamlessly distinguishes static codes and rolling passes', () => {
    const staticCode = signTicketCode(dummyTicketId);
    const rollingPass = generateRollingPassCode(dummyTicketId, 15);

    const staticCheck = verifyAnyPass(staticCode);
    expect(staticCheck.valid).toBe(true);
    expect(staticCheck.isRolling).toBe(false);
    expect(staticCheck.ticketId).toBe(dummyTicketId);

    const rollingCheck = verifyAnyPass(rollingPass.code);
    expect(rollingCheck.valid).toBe(true);
    expect(rollingCheck.isRolling).toBe(true);
    expect(rollingCheck.ticketId).toBe(dummyTicketId);
  });

  it('Prometheus /metrics endpoint returns standard gauges and counters', async () => {
    const res = await fetch(`${API_BASE}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const text = await res.text();
    expect(text).toContain('seatlock_uptime_seconds');
    expect(text).toContain('seatlock_db_pool_total_connections');
    expect(text).toContain('seatlock_active_holds_total');
  });
});

