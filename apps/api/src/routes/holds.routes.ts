import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DomainHttpError } from '../errors.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  createHold,
  getSessionSeats,
  releaseHold,
  suggestAdjacentSeats,
} from '../services/holds.service.js';
import { realtimeHub } from '../services/realtime.js';
import { virtualWaitingRoom } from '../services/waiting-room.js';

const router = Router();

const holdRequestSchema = z.object({
  seatIds: z.array(z.string().uuid()).optional(),
  ticketTypeId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).default(1),
  strategy: z.enum(['pessimistic', 'conditional', 'naive']).optional(),
});

function handleRouteError(res: Response, label: string, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: error.issues });
    return;
  }
  if (error instanceof DomainHttpError) {
    res.status(error.statusCode).json(error.payload);
    return;
  }
  console.error(label, error);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}

// GET /sessions/:id/seats - Get seat layout and live statuses
router.get('/sessions/:id/seats', optionalAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getSessionSeats(req.params.id, req.user?.id);
    res.json(result);
  } catch (error: unknown) {
    handleRouteError(res, '[Get Seats Error]', error);
  }
});

// GET /sessions/:id/seats/suggest - Suggest best contiguous adjacent seats (F19)
router.get('/sessions/:id/seats/suggest', async (req: Request, res: Response): Promise<void> => {
  try {
    const quantity = Number(req.query.quantity || 2);
    const tierId = typeof req.query.tierId === 'string' ? req.query.tierId : undefined;
    const suggestion = await suggestAdjacentSeats(req.params.id, quantity, tierId);
    res.json({ suggestion });
  } catch (error: unknown) {
    handleRouteError(res, '[Suggest Seats Error]', error);
  }
});

// GET /sessions/:id/stream - Server-Sent Events stream for live seat changes
router.get('/sessions/:id/stream', (req: Request, res: Response): void => {
  realtimeHub.subscribe(req.params.id, res);
});

// POST /sessions/:id/queue/join - Join Virtual Waiting Room for Flash Sales (F17)
router.post(
  '/sessions/:id/queue/join',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = virtualWaitingRoom.joinQueue(req.params.id, req.user!.id);
      res.json(result);
    } catch (error: unknown) {
      handleRouteError(res, '[Queue Join Error]', error);
    }
  }
);

// GET /sessions/:id/queue/status - Check Virtual Waiting Room position & admission
router.get(
  '/sessions/:id/queue/status',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const status = virtualWaitingRoom.getQueueStatus(req.params.id, req.user!.id);
      res.json(status);
    } catch (error: unknown) {
      handleRouteError(res, '[Queue Status Error]', error);
    }
  }
);

// POST /sessions/:id/holds - Create a seat hold (or GA capacity hold)
router.post(
  '/sessions/:id/holds',
  authMiddleware,
  idempotencyMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const data = holdRequestSchema.parse(req.body);
      const result = await createHold({
        sessionId: req.params.id,
        userId: req.user!.id,
        seatIds: data.seatIds,
        ticketTypeId: data.ticketTypeId,
        quantity: data.quantity,
        strategy: data.strategy,
      });
      res.status(201).json(result);
    } catch (error: unknown) {
      handleRouteError(res, '[Hold Error]', error);
    }
  }
);

// DELETE /holds/:id - Manually release a hold
router.delete('/holds/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await releaseHold(req.params.id, req.user!.id);
    res.json(result);
  } catch (error: unknown) {
    handleRouteError(res, '[Release Hold Error]', error);
  }
});

export default router;
