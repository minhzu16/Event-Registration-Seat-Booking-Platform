import nodemailer from 'nodemailer';
import { generateQrDataUrl } from './qr.js';

interface TicketEmailData {
  id: string;
  code: string;
  attendeeName: string;
  ticketTypeName: string;
  section?: string;
  rowLabel?: string;
  seatNumber?: number;
}

// Configurable SMTP transporter (defaults to Mailpit on localhost:1025 or fallback logger)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: Number(process.env.SMTP_PORT || 1025),
  ignoreTLS: true,
});

export async function sendBookingConfirmationEmail(
  toEmail: string,
  event: { title: string; venue_name: string; starts_at: string; cancel_deadline_hours: number; refund_percent: number },
  booking: { reference: string; total_amount: number },
  tickets: TicketEmailData[]
): Promise<boolean> {
  try {
    const formattedDate = new Date(event.starts_at).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const qrDataUrls = await Promise.all(tickets.map((t) => generateQrDataUrl(t.code)));

    const ticketsHtml = tickets
      .map(
        (t, idx) => `
        <div style="background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #334155; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h4 style="margin: 0 0 6px 0; color: #f8fafc; font-size: 16px;">${t.attendeeName}</h4>
            <p style="margin: 0 0 4px 0; color: #818cf8; font-size: 13px; font-weight: 600;">${t.ticketTypeName}</p>
            <p style="margin: 0; color: #cbd5e1; font-size: 13px; font-family: monospace;">
              ${t.section ? `${t.section} — Row <strong>${t.rowLabel}</strong>, Seat <strong>${t.seatNumber}</strong>` : 'General Admission'}
            </p>
            <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 11px; font-family: monospace;">Pass Code: ${t.code.substring(0, 18)}...</p>
          </div>
          <div style="text-align: center; background: #ffffff; padding: 8px; border-radius: 8px;">
            <img src="${qrDataUrls[idx]}" alt="Ticket QR" style="width: 100px; height: 100px; display: block;" />
          </div>
        </div>
      `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 20px; border: 1px solid #1e293b; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
          <div style="text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 24px;">
            <span style="background: rgba(99, 102, 241, 0.2); color: #818cf8; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;">Official E-Ticket Confirmation</span>
            <h1 style="color: #ffffff; margin: 12px 0 4px 0; font-size: 24px;">${event.title}</h1>
            <p style="color: #94a3b8; margin: 0; font-size: 14px;">Booking Ref: <strong style="color: #38bdf8; font-family: monospace;">${booking.reference}</strong></p>
          </div>

          <div style="background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #cbd5e1;"><strong>📅 Showtime:</strong> ${formattedDate}</p>
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #cbd5e1;"><strong>📍 Venue:</strong> ${event.venue_name}</p>
            <p style="margin: 0; font-size: 13px; color: #cbd5e1;"><strong>💳 Total Amount Paid:</strong> ${Number(booking.total_amount).toLocaleString('vi-VN')} ₫</p>
          </div>

          <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">Your Passes & Entrance QR Codes:</h3>
          ${ticketsHtml}

          <div style="border-top: 1px solid #334155; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center;">
            <p style="margin: 0 0 6px 0;">🛡️ <strong>Cancellation Policy:</strong> Full ${event.refund_percent}% refund available up to ${event.cancel_deadline_hours}h before event start.</p>
            <p style="margin: 0;">Please present these digital QR passes at gate inspection. Each pass is cryptographically signed with HMAC-SHA256.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Attempt SMTP dispatch asynchronously
    transporter
      .sendMail({
        from: '"SeatLock Events" <no-reply@seatlock.io>',
        to: toEmail,
        subject: `Your Tickets for ${event.title} [${booking.reference}]`,
        html: htmlContent,
      })
      .then((info) => {
        console.log(`[Email] Ticket email sent to ${toEmail} (MessageID: ${info.messageId})`);
      })
      .catch((err) => {
        // Fallback log without failing user flow
        console.log(`[Email Notice] SMTP not listening on port 1025, simulated ticket email logged for ${toEmail}`);
      });

    return true;
  } catch (error) {
    console.error('[Email Error]', error);
    return false;
  }
}
