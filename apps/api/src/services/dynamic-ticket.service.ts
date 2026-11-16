import crypto from 'crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';

// Fast in-memory utility encoders for high-throughput ticket issuance
const toB64Url = (str: string): string => Buffer.from(str, 'utf8').toString('base64url');
const fromB64Url = (b64: string): string => Buffer.from(b64, 'base64url').toString('utf8');
const hmacDigest = (key: string, data: string): string =>
  crypto.createHmac('sha256', key).update(data).digest('base64url');

export interface DynamicTokenOptions {
  timeStepSeconds?: number;
  timestampMs?: number;
  deviceFingerprint?: string;
}

export interface DynamicVerifyOptions {
  timeStepSeconds?: number;
  currentTimestampMs?: number;
  allowedDriftSteps?: number;
  deviceFingerprint?: string;
}

export interface DynamicTicketToken {
  token: string;
  ticketId: string;
  timeStep: number;
  expiresAt: number;
  remainingSeconds: number;
  qrDataUrl?: string;
}

export interface DynamicTokenVerificationResult {
  valid: boolean;
  ticketId?: string;
  timeStep?: number;
  driftSteps?: number;
  reason?:
    | 'EXPIRED_TIME_STEP'
    | 'TAMPERED_SIGNATURE'
    | 'INVALID_FORMAT'
    | 'DEVICE_MISMATCH'
    | 'MALFORMED_TOKEN';
}

/**
 * Production-Grade DynamicTicketService (SafeTix™ & DICE.fm Architecture).
 *
 * Employs Guard Clauses, early returns, and fast URL-safe base64 buffers.
 * Zero-boilerplate cryptographic rotating tokens refreshed every 15s.
 */
export class DynamicTicketService {
  public static readonly DEFAULT_TIME_STEP_SECONDS = 15;
  public static readonly DEFAULT_ALLOWED_DRIFT_STEPS = 1;

  private readonly secret: string;

  constructor(secret = config.QR_HMAC_SECRET) {
    this.secret = secret;
  }

  /**
   * Generates a time-bound dynamic rotating token for a ticket.
   */
  public generateToken(ticketId: string, options: DynamicTokenOptions = {}): DynamicTicketToken {
    if (!ticketId || typeof ticketId !== 'string') {
      throw new Error('TicketId is required for generating dynamic token');
    }

    const timeStepSeconds = options.timeStepSeconds ?? DynamicTicketService.DEFAULT_TIME_STEP_SECONDS;
    const nowMs = options.timestampMs ?? Date.now();
    const timeStep = Math.floor(Math.floor(nowMs / 1000) / timeStepSeconds);
    const expiresAt = (timeStep + 1) * timeStepSeconds * 1000;
    const remainingSeconds = Math.max(1, Math.floor((expiresAt - nowMs) / 1000));

    // Payload: ticketId:timeStep[:deviceFingerprint]
    const payload = options.deviceFingerprint
      ? `${ticketId}:${timeStep}:${options.deviceFingerprint}`
      : `${ticketId}:${timeStep}`;

    const signature = hmacDigest(this.secret, payload);
    const encodedId = toB64Url(ticketId);

    // Format: ROLL.<encodedTicketId>.<timeStep>.<signature>[.<fingerprintHash>]
    let token = `ROLL.${encodedId}.${timeStep}.${signature}`;
    if (options.deviceFingerprint) {
      const fpHash = crypto.createHash('sha256').update(options.deviceFingerprint).digest('base64url').slice(0, 12);
      token = `${token}.${fpHash}`;
    }

    return { token, ticketId, timeStep, expiresAt, remainingSeconds };
  }

  /**
   * Generates both dynamic token and high-density QR Data URL for mobile rendering.
   */
  public async generateTokenWithQr(ticketId: string, options: DynamicTokenOptions = {}): Promise<DynamicTicketToken> {
    const tokenInfo = this.generateToken(ticketId, options);
    const qrDataUrl = await QRCode.toDataURL(tokenInfo.token, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 280,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    return { ...tokenInfo, qrDataUrl };
  }

  /**
   * Verifies dynamic rotating token with Guard Clauses and constant-time comparison.
   */
  public verifyToken(token: string, options: DynamicVerifyOptions = {}): DynamicTokenVerificationResult {
    try {
      if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'INVALID_FORMAT' };
      }

      const parts = token.split('.');
      if ((parts.length !== 4 && parts.length !== 5) || parts[0] !== 'ROLL') {
        return { valid: false, reason: 'INVALID_FORMAT' };
      }

      const [, encodedId, timeStepStr, signature, fpHash] = parts;
      const tokenStep = Number(timeStepStr);
      if (Number.isNaN(tokenStep)) {
        return { valid: false, reason: 'INVALID_FORMAT' };
      }

      const ticketId = fromB64Url(encodedId);
      const timeStepSeconds = options.timeStepSeconds ?? DynamicTicketService.DEFAULT_TIME_STEP_SECONDS;
      const allowedDrift = options.allowedDriftSteps ?? DynamicTicketService.DEFAULT_ALLOWED_DRIFT_STEPS;
      const nowMs = options.currentTimestampMs ?? Date.now();
      const currentStep = Math.floor(Math.floor(nowMs / 1000) / timeStepSeconds);
      const driftSteps = currentStep - tokenStep;

      // Guard Clause 1: Time drift boundary
      if (Math.abs(driftSteps) > allowedDrift) {
        return { valid: false, ticketId, timeStep: tokenStep, driftSteps, reason: 'EXPIRED_TIME_STEP' };
      }

      // Guard Clause 2: Device binding check
      if (parts.length === 5 && options.deviceFingerprint) {
        const expectedFpHash = crypto.createHash('sha256').update(options.deviceFingerprint).digest('base64url').slice(0, 12);
        if (fpHash !== expectedFpHash) {
          return { valid: false, ticketId, reason: 'DEVICE_MISMATCH' };
        }
      }

      // Guard Clause 3: Cryptographic signature validation
      const payload = options.deviceFingerprint && parts.length === 5
        ? `${ticketId}:${tokenStep}:${options.deviceFingerprint}`
        : `${ticketId}:${tokenStep}`;

      const expectedSig = hmacDigest(this.secret, payload);
      if (signature.length !== expectedSig.length) {
        return { valid: false, ticketId, reason: 'TAMPERED_SIGNATURE' };
      }

      const isValid = crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSig, 'utf8'));
      return {
        valid: isValid,
        ticketId: isValid ? ticketId : undefined,
        timeStep: tokenStep,
        driftSteps,
        reason: isValid ? undefined : 'TAMPERED_SIGNATURE',
      };
    } catch {
      return { valid: false, reason: 'MALFORMED_TOKEN' };
    }
  }
}

export const dynamicTicketService = new DynamicTicketService();
