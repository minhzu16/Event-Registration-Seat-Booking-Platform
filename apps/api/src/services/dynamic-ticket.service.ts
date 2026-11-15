import crypto from 'crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';

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
 * Production-Grade DynamicTicketService (Ticketmaster SafeTix™ & DICE.fm Architecture).
 *
 * Provides cryptographic rotating tokens that refresh every N seconds (default 15s)
 * with HMAC-SHA256 signature and time-drift tolerance (±1 step).
 * Defeats screenshot scalping, replay attacks, and unauthorized ticket transfers.
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
  public generateToken(
    ticketId: string,
    options: DynamicTokenOptions = {}
  ): DynamicTicketToken {
    if (!ticketId || typeof ticketId !== 'string') {
      throw new Error('TicketId is required for generating dynamic token');
    }

    const timeStepSeconds = options.timeStepSeconds ?? DynamicTicketService.DEFAULT_TIME_STEP_SECONDS;
    const nowMs = options.timestampMs ?? Date.now();
    const nowSeconds = Math.floor(nowMs / 1000);
    const timeStep = Math.floor(nowSeconds / timeStepSeconds);

    const expiresAt = (timeStep + 1) * timeStepSeconds * 1000;
    const remainingSeconds = Math.max(1, Math.floor((expiresAt - nowMs) / 1000));

    // Construct deterministic payload: ticketId:timeStep[:deviceFingerprint]
    const payload = options.deviceFingerprint
      ? `${ticketId}:${timeStep}:${options.deviceFingerprint}`
      : `${ticketId}:${timeStep}`;

    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payload);
    const signature = hmac.digest('base64url');
    const encodedId = Buffer.from(ticketId, 'utf8').toString('base64url');

    // Token format: ROLL.<encodedTicketId>.<timeStep>.<signature>[.<fingerprintHash>]
    let token = `ROLL.${encodedId}.${timeStep}.${signature}`;
    if (options.deviceFingerprint) {
      const fpHash = crypto.createHash('sha256').update(options.deviceFingerprint).digest('base64url').slice(0, 12);
      token = `${token}.${fpHash}`;
    }

    return {
      token,
      ticketId,
      timeStep,
      expiresAt,
      remainingSeconds,
    };
  }

  /**
   * Generates both the dynamic token and the high-density QR Data URL for mobile render.
   */
  public async generateTokenWithQr(
    ticketId: string,
    options: DynamicTokenOptions = {}
  ): Promise<DynamicTicketToken> {
    const tokenInfo = this.generateToken(ticketId, options);
    const qrDataUrl = await QRCode.toDataURL(tokenInfo.token, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return {
      ...tokenInfo,
      qrDataUrl,
    };
  }

  /**
   * Verifies a dynamic rotating token with time-drift absorption and signature validation.
   */
  public verifyToken(
    token: string,
    options: DynamicVerifyOptions = {}
  ): DynamicTokenVerificationResult {
    try {
      if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'INVALID_FORMAT' };
      }

      const parts = token.split('.');
      if ((parts.length !== 4 && parts.length !== 5) || parts[0] !== 'ROLL') {
        return { valid: false, reason: 'INVALID_FORMAT' };
      }

      const [, encodedId, timeStepStr, signature, fpHash] = parts;
      const tokenStep = parseInt(timeStepStr, 10);
      if (isNaN(tokenStep)) {
        return { valid: false, reason: 'INVALID_FORMAT' };
      }

      const ticketId = Buffer.from(encodedId, 'base64url').toString('utf8');
      const timeStepSeconds = options.timeStepSeconds ?? DynamicTicketService.DEFAULT_TIME_STEP_SECONDS;
      const allowedDriftSteps = options.allowedDriftSteps ?? DynamicTicketService.DEFAULT_ALLOWED_DRIFT_STEPS;
      const nowMs = options.currentTimestampMs ?? Date.now();
      const currentStep = Math.floor(Math.floor(nowMs / 1000) / timeStepSeconds);

      const driftSteps = currentStep - tokenStep;
      if (Math.abs(driftSteps) > allowedDriftSteps) {
        return {
          valid: false,
          ticketId,
          timeStep: tokenStep,
          driftSteps,
          reason: 'EXPIRED_TIME_STEP',
        };
      }

      // Check device fingerprint if bound
      if (parts.length === 5 && options.deviceFingerprint) {
        const expectedFpHash = crypto.createHash('sha256').update(options.deviceFingerprint).digest('base64url').slice(0, 12);
        if (fpHash !== expectedFpHash) {
          return { valid: false, ticketId, reason: 'DEVICE_MISMATCH' };
        }
      }

      // Verify HMAC signature
      const payload = options.deviceFingerprint && parts.length === 5
        ? `${ticketId}:${tokenStep}:${options.deviceFingerprint}`
        : `${ticketId}:${tokenStep}`;

      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(payload);
      const expectedSig = hmac.digest('base64url');

      if (signature.length !== expectedSig.length) {
        return { valid: false, ticketId, reason: 'TAMPERED_SIGNATURE' };
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSig, 'utf8')
      );

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
