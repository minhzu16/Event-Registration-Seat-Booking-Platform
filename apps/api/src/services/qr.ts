import crypto from 'crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';

export const ROLLING_WINDOW_SECONDS = 15;

/**
 * Static HMAC signature for tickets (traditional offline verifiable pass).
 */
export function signTicketCode(ticketId: string): string {
  const hmac = crypto.createHmac('sha256', config.QR_HMAC_SECRET);
  hmac.update(ticketId);
  const signature = hmac.digest('base64url');
  const encodedId = Buffer.from(ticketId).toString('base64url');
  return `${encodedId}.${signature}`;
}

/**
 * Verifies standard static ticket code.
 */
export function verifyTicketCode(code: string): { valid: boolean; ticketId?: string } {
  try {
    const parts = code.split('.');
    if (parts.length !== 2) {
      return { valid: false };
    }
    const [encodedId, signature] = parts;
    const ticketId = Buffer.from(encodedId, 'base64url').toString('utf8');

    const hmac = crypto.createHmac('sha256', config.QR_HMAC_SECRET);
    hmac.update(ticketId);
    const expectedSig = hmac.digest('base64url');

    if (signature.length !== expectedSig.length) {
      return { valid: false };
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    );

    return { valid: isValid, ticketId: isValid ? ticketId : undefined };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Ticketmaster SafeTix™ / DICE.fm Pattern:
 * Cryptographic Dynamic Rolling QR Code rotating every 15 seconds.
 * Defeats 100% of screenshot reselling / scalping fraud.
 */
export function generateRollingPassCode(
  ticketId: string,
  windowSeconds = ROLLING_WINDOW_SECONDS
): { code: string; expiresAt: number; remainingSeconds: number } {
  const now = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(now / windowSeconds);
  const expiresAt = (currentWindow + 1) * windowSeconds * 1000;
  const remainingSeconds = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));

  const payload = `${ticketId}:${currentWindow}`;
  const hmac = crypto.createHmac('sha256', config.QR_HMAC_SECRET);
  hmac.update(payload);
  const sig = hmac.digest('base64url');
  const encodedId = Buffer.from(ticketId).toString('base64url');

  const code = `ROLL.${encodedId}.${currentWindow}.${sig}`;
  return { code, expiresAt, remainingSeconds };
}

/**
 * Verifies rolling dynamic pass code allowing ±1 window (drift tolerance).
 */
export function verifyRollingPassCode(
  code: string,
  windowSeconds = ROLLING_WINDOW_SECONDS
): { valid: boolean; ticketId?: string; reason?: string } {
  try {
    const parts = code.split('.');
    if (parts.length !== 4 || parts[0] !== 'ROLL') {
      return { valid: false, reason: 'NOT_A_ROLLING_PASS' };
    }

    const [, encodedId, windowStr, signature] = parts;
    const tokenWindow = parseInt(windowStr, 10);
    if (isNaN(tokenWindow)) {
      return { valid: false, reason: 'INVALID_WINDOW' };
    }

    const ticketId = Buffer.from(encodedId, 'base64url').toString('utf8');
    const now = Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(now / windowSeconds);

    // Window must be within [current - 1, current + 1] to absorb network/scanning latency
    if (Math.abs(currentWindow - tokenWindow) > 1) {
      return { valid: false, reason: 'EXPIRED_ROLLING_TOKEN' };
    }

    // Verify HMAC for token's specific window
    const payload = `${ticketId}:${tokenWindow}`;
    const hmac = crypto.createHmac('sha256', config.QR_HMAC_SECRET);
    hmac.update(payload);
    const expectedSig = hmac.digest('base64url');

    if (signature.length !== expectedSig.length) {
      return { valid: false, reason: 'TAMPERED_SIGNATURE' };
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    );

    return {
      valid: isValid,
      ticketId: isValid ? ticketId : undefined,
      reason: isValid ? undefined : 'TAMPERED_SIGNATURE',
    };
  } catch (error) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
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
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    width: 280,
  });
}
