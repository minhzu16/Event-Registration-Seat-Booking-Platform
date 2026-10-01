import crypto from 'crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';

export function signTicketCode(ticketId: string): string {
  const hmac = crypto.createHmac('sha256', config.QR_HMAC_SECRET);
  hmac.update(ticketId);
  const signature = hmac.digest('base64url');
  const encodedId = Buffer.from(ticketId).toString('base64url');
  return `${encodedId}.${signature}`;
}

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

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    );

    return { valid: isValid, ticketId: isValid ? ticketId : undefined };
  } catch (error) {
    return { valid: false };
  }
}

export async function generateQrDataUrl(code: string): Promise<string> {
  return await QRCode.toDataURL(code, {
    errorCorrectionLevel: 'H',
    margin: 2,
    color: {
      dark: '#1e1b4b',
      light: '#ffffff',
    },
    width: 280,
  });
}
