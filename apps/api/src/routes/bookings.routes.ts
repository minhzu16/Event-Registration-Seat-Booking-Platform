import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DomainHttpError } from '../errors.js';
import { authMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  cancelBooking,
  confirmHold,
  getTicketRollingPass,
  getUserBookings,
  processPaymentWebhook,
} from '../services/bookings.service.js';

const router = Router();

const confirmSchema = z.object({
  paymentMethod: z.enum(['mock_card', 'free', 'momo', 'vnpay']).default('mock_card'),
  simulateFailure: z.boolean().optional(),
  attendeeNames: z.record(z.string(), z.string()).optional(),
});

const webhookPayloadSchema = z.object({
  eventId: z.string(),
  holdId: z.string().uuid(),
  transactionId: z.string(),
  amount: z.number().positive(),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  signature: z.string().optional(),
});

function handleRouteError(res: Response, label: string, error: unknown): void {
  if (error instanceof DomainHttpError) {
    res.status(error.statusCode).json(error.payload);
    return;
  }
  console.error(label, error);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}

// POST /holds/:id/confirm - Confirm hold and issue tickets
router.post(
  '/holds/:id/confirm',
  authMiddleware,
  idempotencyMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const data = confirmSchema.parse(req.body);
      const result = await confirmHold({
        holdId: req.params.id,
        userId: req.user!.id,
        userEmail: req.user!.email,
        userFullName: req.user!.fullName,
        paymentMethod: data.paymentMethod,
        simulateFailure: data.simulateFailure,
        attendeeNames: data.attendeeNames,
      });

      if (result.alreadyConfirmed) {
        res.json({
          booking: result.booking,
          tickets: result.tickets,
          message: 'Booking already confirmed',
        });
        return;
      }

      res.status(201).json({
        booking: result.booking,
        tickets: result.tickets,
        message: 'Booking confirmed successfully!',
      });
    } catch (error: unknown) {
      handleRouteError(res, '[Confirm Booking Error]', error);
    }
  }
);

// GET /me/bookings - Get current attendee's bookings and tickets
router.get('/me/bookings', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bookings = await getUserBookings(req.user!.id);
    res.json({ bookings });
  } catch (error: unknown) {
    handleRouteError(res, '[Get Bookings Error]', error);
  }
});

// POST /bookings/:id/cancel - Cancel booking according to event policy
router.post('/bookings/:id/cancel', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await cancelBooking(req.params.id, req.user!.id);
    res.json(result);
  } catch (error: unknown) {
    handleRouteError(res, '[Cancel Booking Error]', error);
  }
});

// GET /tickets/:id/rolling-pass - Generate dynamic anti-scalping SafeTix pass (DICE.fm / Ticketmaster)
router.get(
  '/tickets/:id/rolling-pass',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pass = await getTicketRollingPass(req.params.id, req.user!.id, req.user!.role);
      res.json(pass);
    } catch (error: unknown) {
      handleRouteError(res, '[Rolling Pass Error]', error);
    }
  }
);

// POST /webhooks/payment - Webhook ingestion for asynchronous payment reconciliation (Stripe/VNPay/PayOS)
router.post('/webhooks/payment', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = webhookPayloadSchema.parse(req.body);
    const result = await processPaymentWebhook(data);
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Webhook Payment Error]', error);
    res.status(400).json({ error: 'WEBHOOK_ERROR', message: msg });
  }
});

export default router;
