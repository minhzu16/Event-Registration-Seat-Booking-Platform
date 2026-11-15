import { describe, it, expect } from 'vitest';
import { DynamicTicketService, dynamicTicketService } from '../src/services/dynamic-ticket.service.js';

describe('SafeTix™ Dynamic Rotating Ticket Token & Anti-Scalping Test Suite', () => {
  const service = new DynamicTicketService('test-crypto-secret-key-safe-tix-2026');
  const dummyTicketId = 'e2b34a91-4c17-48f9-b876-599201a0db42';

  it('Step 1: Generates valid SafeTix-compliant dynamic token with timing metadata', () => {
    const fixedNow = 1700000000000; // Fixed timestamp
    const tokenInfo = service.generateToken(dummyTicketId, {
      timeStepSeconds: 15,
      timestampMs: fixedNow,
    });

    expect(tokenInfo.token.startsWith('ROLL.')).toBe(true);
    expect(tokenInfo.ticketId).toBe(dummyTicketId);
    expect(tokenInfo.timeStep).toBe(Math.floor(fixedNow / 1000 / 15));
    expect(tokenInfo.expiresAt).toBe((tokenInfo.timeStep + 1) * 15 * 1000);
    expect(tokenInfo.remainingSeconds).toBeGreaterThanOrEqual(1);
    expect(tokenInfo.remainingSeconds).toBeLessThanOrEqual(15);
  });

  it('Step 2: Successfully verifies dynamic token generated in the same time step', () => {
    const fixedNow = 1700000010000;
    const tokenInfo = service.generateToken(dummyTicketId, {
      timeStepSeconds: 15,
      timestampMs: fixedNow,
    });

    const result = service.verifyToken(tokenInfo.token, {
      timeStepSeconds: 15,
      currentTimestampMs: fixedNow + 2000, // 2 seconds later, still same window
      allowedDriftSteps: 1,
    });

    expect(result.valid).toBe(true);
    expect(result.ticketId).toBe(dummyTicketId);
    expect(result.driftSteps).toBe(0);
    expect(result.reason).toBeUndefined();
  });

  it('Step 3: Absorbs ±1 time-step drift tolerance to handle network latency and scanning delays', () => {
    const fixedNow = 1700000000000;
    const tokenInfo = service.generateToken(dummyTicketId, {
      timeStepSeconds: 15,
      timestampMs: fixedNow,
    });

    // Verify 1 step in the future (15s - 29s later)
    const futureResult = service.verifyToken(tokenInfo.token, {
      timeStepSeconds: 15,
      currentTimestampMs: fixedNow + 16000,
      allowedDriftSteps: 1,
    });
    expect(futureResult.valid).toBe(true);
    expect(futureResult.ticketId).toBe(dummyTicketId);
    expect(futureResult.driftSteps).toBe(1);

    // Verify 1 step in the past (-15s earlier, e.g. scanner clock slightly behind)
    const pastResult = service.verifyToken(tokenInfo.token, {
      timeStepSeconds: 15,
      currentTimestampMs: fixedNow - 14000,
      allowedDriftSteps: 1,
    });
    expect(pastResult.valid).toBe(true);
    expect(pastResult.driftSteps).toBe(-1);
  });

  it('Step 4: Rejects expired tokens beyond allowed drift (Anti-Screenshot Scalping)', () => {
    const fixedNow = 1700000000000;
    const tokenInfo = service.generateToken(dummyTicketId, {
      timeStepSeconds: 15,
      timestampMs: fixedNow,
    });

    // Scanner receives token 35 seconds later (more than 2 windows ahead)
    const expiredResult = service.verifyToken(tokenInfo.token, {
      timeStepSeconds: 15,
      currentTimestampMs: fixedNow + 35000,
      allowedDriftSteps: 1,
    });

    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.reason).toBe('EXPIRED_TIME_STEP');
    expect(expiredResult.driftSteps).toBeGreaterThan(1);
  });

  it('Step 5: Rejects tampered tokens and altered signatures with constant-time equality check', () => {
    const tokenInfo = service.generateToken(dummyTicketId);
    const parts = tokenInfo.token.split('.');
    
    // Tamper with signature
    parts[3] = parts[3].slice(0, -4) + 'WXYZ';
    const tamperedToken = parts.join('.');

    const result = service.verifyToken(tamperedToken);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('TAMPERED_SIGNATURE');
  });

  it('Step 6: Supports Device Fingerprint Binding for DICE.fm-style Phone Locking', () => {
    const deviceId = 'iPhone15Pro-SecureEnclave-UUID-9876';
    const tokenInfo = service.generateToken(dummyTicketId, {
      deviceFingerprint: deviceId,
    });

    // Same device verification succeeds
    const verified = service.verifyToken(tokenInfo.token, {
      deviceFingerprint: deviceId,
    });
    expect(verified.valid).toBe(true);
    expect(verified.ticketId).toBe(dummyTicketId);

    // Different device verification fails (preventing QR sharing across phones)
    const hijacked = service.verifyToken(tokenInfo.token, {
      deviceFingerprint: 'Android-Emulator-Device-1234',
    });
    expect(hijacked.valid).toBe(false);
    expect(hijacked.reason).toBe('DEVICE_MISMATCH');
  });

  it('Step 7: Generates complete QR Data URL with error correction level H', async () => {
    const qrToken = await service.generateTokenWithQr(dummyTicketId);
    expect(qrToken.qrDataUrl).toBeDefined();
    expect(qrToken.qrDataUrl!.startsWith('data:image/png;base64,')).toBe(true);
  });
});
