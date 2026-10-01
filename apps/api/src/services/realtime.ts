import { Response } from 'express';

interface SseClient {
  id: string;
  sessionId: string;
  res: Response;
}

class RealtimeHub {
  private clients: Map<string, SseClient[]> = new Map();

  public subscribe(sessionId: string, res: Response): () => void {
    const clientId = Math.random().toString(36).substring(2, 9);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial ping
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, sessionId, timestamp: Date.now() })}\n\n`);

    const client: SseClient = { id: clientId, sessionId, res };
    const sessionClients = this.clients.get(sessionId) || [];
    sessionClients.push(client);
    this.clients.set(sessionId, sessionClients);

    const cleanup = () => {
      const current = this.clients.get(sessionId) || [];
      this.clients.set(
        sessionId,
        current.filter((c) => c.id !== clientId)
      );
    };

    res.on('close', cleanup);
    res.on('finish', cleanup);

    return cleanup;
  }

  public broadcast(sessionId: string, eventName: 'seat_held' | 'seat_released' | 'seat_booked' | 'capacity_updated', payload: any) {
    const sessionClients = this.clients.get(sessionId);
    if (!sessionClients || sessionClients.length === 0) return;

    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of sessionClients) {
      try {
        client.res.write(message);
      } catch (err) {
        // client disconnected
      }
    }
  }

  public getSubscriberCount(sessionId: string): number {
    return this.clients.get(sessionId)?.length || 0;
  }
}

export const realtimeHub = new RealtimeHub();
