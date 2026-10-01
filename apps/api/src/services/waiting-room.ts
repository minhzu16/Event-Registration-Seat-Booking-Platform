import crypto from 'crypto';
import { config } from '../config.js';

interface QueueAttendee {
  userId: string;
  joinedAt: number;
  admittedAt?: number;
  admissionToken?: string;
  validUntil?: number;
}

class VirtualWaitingRoom {
  // SessionId -> list of queued attendees
  private queues: Map<string, QueueAttendee[]> = new Map();
  // Max concurrent attendees admitted into the seat selection room per minute
  private admissionRatePerMinute: number = 30;

  public joinQueue(sessionId: string, userId: string): { position: number; admissionToken?: string; validUntil?: number } {
    let queue = this.queues.get(sessionId);
    if (!queue) {
      queue = [];
      this.queues.set(sessionId, queue);
    }

    const existing = queue.find((q) => q.userId === userId);
    if (existing) {
      // Check if already admitted and token is still valid
      if (existing.admissionToken && existing.validUntil && existing.validUntil > Date.now()) {
        return {
          position: 0,
          admissionToken: existing.admissionToken,
          validUntil: existing.validUntil,
        };
      }
      const pos = queue.indexOf(existing) + 1;
      return { position: pos };
    }

    // If queue is small (e.g. < 5), admit immediately!
    const activeAdmitted = queue.filter((q) => q.validUntil && q.validUntil > Date.now()).length;
    if (activeAdmitted < 50 && queue.length === 0) {
      const token = this.generateToken(sessionId, userId);
      const validUntil = Date.now() + 15 * 60 * 1000;
      queue.push({
        userId,
        joinedAt: Date.now(),
        admittedAt: Date.now(),
        admissionToken: token,
        validUntil,
      });
      return { position: 0, admissionToken: token, validUntil };
    }

    const newAttendee: QueueAttendee = {
      userId,
      joinedAt: Date.now(),
    };
    queue.push(newAttendee);
    return { position: queue.length };
  }

  public getQueueStatus(
    sessionId: string,
    userId: string
  ): { position: number; totalWaiting: number; admissionToken?: string; validUntil?: number; estimatedWaitSeconds: number } {
    const queue = this.queues.get(sessionId) || [];
    this.cleanExpired(sessionId);

    const attendee = queue.find((q) => q.userId === userId);
    if (!attendee) {
      return { position: -1, totalWaiting: queue.length, estimatedWaitSeconds: 0 };
    }

    if (attendee.admissionToken && attendee.validUntil && attendee.validUntil > Date.now()) {
      return {
        position: 0,
        totalWaiting: queue.length,
        admissionToken: attendee.admissionToken,
        validUntil: attendee.validUntil,
        estimatedWaitSeconds: 0,
      };
    }

    // Process admissions from head of queue
    const waitingAttendees = queue.filter((q) => !q.admissionToken);
    const waitingIndex = waitingAttendees.indexOf(attendee);

    // If at front of queue, admit!
    if (waitingIndex >= 0 && waitingIndex < 5) {
      const token = this.generateToken(sessionId, userId);
      const validUntil = Date.now() + 15 * 60 * 1000;
      attendee.admittedAt = Date.now();
      attendee.admissionToken = token;
      attendee.validUntil = validUntil;

      return {
        position: 0,
        totalWaiting: queue.length,
        admissionToken: token,
        validUntil,
        estimatedWaitSeconds: 0,
      };
    }

    const estimatedWait = Math.ceil((waitingIndex * 60) / this.admissionRatePerMinute);

    return {
      position: waitingIndex + 1,
      totalWaiting: waitingAttendees.length,
      estimatedWaitSeconds: estimatedWait,
    };
  }

  public verifyAdmissionToken(sessionId: string, userId: string, token: string): boolean {
    try {
      const [payloadB64, signature] = token.split('.');
      if (!payloadB64 || !signature) return false;

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (payload.sessionId !== sessionId || payload.userId !== userId) return false;
      if (payload.exp < Date.now()) return false;

      const hmac = crypto.createHmac('sha256', config.JWT_SECRET);
      hmac.update(payloadB64);
      const expectedSig = hmac.digest('base64url');

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    } catch {
      return false;
    }
  }

  private generateToken(sessionId: string, userId: string): string {
    const payload = {
      sessionId,
      userId,
      exp: Date.now() + 15 * 60 * 1000,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const hmac = crypto.createHmac('sha256', config.JWT_SECRET);
    hmac.update(payloadB64);
    const signature = hmac.digest('base64url');
    return `${payloadB64}.${signature}`;
  }

  private cleanExpired(sessionId: string) {
    const queue = this.queues.get(sessionId);
    if (!queue) return;
    const now = Date.now();
    this.queues.set(
      sessionId,
      queue.filter((q) => !q.validUntil || q.validUntil > now)
    );
  }
}

export const virtualWaitingRoom = new VirtualWaitingRoom();
