import crypto from 'crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { DynamicTicketService, dynamicTicketService } from './dynamic-ticket.service.js';

export { DynamicTicketService, dynamicTicketService };
export const ROLLING_WINDOW_SECONDS = DynamicTicketService.DEFAULT_TIME_STEP_SECONDS;

const toB64Url = (str: string): string => Buffer.from(str, 'utf8').toString('base64url');
const fromB64Url = (b64: string): string => Buffer.from(b64, 'base64url').toString('utf8');

/**
 * Static HMAC signature for tickets (traditional offline verifiable pass).
 */
export function signTicketCode(ticketId: string): string {
  const signature = crypto.createHmac('sha256', config.QR_HMAC_SECRET).update(ticketId).digest('base64url');
  return `${toB64Url(ticketId)}.${signature}`;
}

/**
 * Verifies standard static ticket code using Guard Clauses.
 */
export function verifyTicketCode(code: string): { valid: boolean; ticketId?: string } {
  try {
    const parts = code.split('.');
    if (parts.length !== 2) return { valid: false };

    const [encodedId, signature] = parts;
    const ticketId = fromB64Url(encodedId);
    const expectedSig = crypto.createHmac('sha256', config.QR_HMAC_SECRET).update(ticketId).digest('base64url');

    if (signature.length !== expectedSig.length) return { valid: false };

    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    return { valid: isValid, ticketId: isValid ? ticketId : undefined };
  } catch {
    return { valid: false };
  }
}

/**
 * Ticketmaster SafeTix™ / DICE.fm Pattern:
 * Cryptographic Dynamic Rolling QR Code rotating every 15 seconds.
 */
export function generateRollingPassCode(
  ticketId: string,
  windowSeconds = ROLLING_WINDOW_SECONDS
): { code: string; expiresAt: number; remainingSeconds: number } {
  const token = dynamicTicketService.generateToken(ticketId, { timeStepSeconds: windowSeconds });
  return { code: token.token, expiresAt: token.expiresAt, remainingSeconds: token.remainingSeconds };
}

/**
 * Verifies rolling dynamic pass code allowing ±1 window (drift tolerance).
 */
export function verifyRollingPassCode(
  code: string,
  windowSeconds = ROLLING_WINDOW_SECONDS
): { valid: boolean; ticketId?: string; reason?: string } {
  const res = dynamicTicketService.verifyToken(code, { timeStepSeconds: windowSeconds });
  const reason = res.reason === 'EXPIRED_TIME_STEP' ? 'EXPIRED_ROLLING_TOKEN' : res.reason;
  return { valid: res.valid, ticketId: res.ticketId, reason };
}

/**
 * Unified Scanner verification: accepts both static codes and dynamic rolling passes!
 */
export function verifyAnyPass(code: string): { valid: boolean; ticketId?: string; isRolling?: boolean; reason?: string } {
  if (code.startsWith('ROLL.')) {
    const rollRes = verifyRollingPassCode(code);
    return { ...rollRes, isRolling: true };
  }
  const staticRes = verifyTicketCode(code);
  return { ...staticRes, isRolling: false, reason: staticRes.valid ? undefined : 'INVALID_STATIC_SIGNATURE' };
}

export async function generateQrDataUrl(code: string): Promise<string> {
  return await QRCode.toDataURL(code, {
    errorCorrectionLevel: 'H',
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
    width: 280,
  });
}
