import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../database.js';

export type UserRole = 'ATTENDEE' | 'ORGANISER' | 'STAFF' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
    return;
  }

  const token = authHeader.split(' ')[1];
  let payload: AuthUser;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as AuthUser;
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
    return;
  }

  try {
    const { rows } = await query<{ role: UserRole }>('SELECT role FROM users WHERE id = $1', [payload.id]);
    if (rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
      return;
    }
    payload.role = rows[0].role;
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as AuthUser;
      req.user = payload;
    } catch {
      // ignore invalid optional token
    }
  }
  next();
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (req.user.role === 'ADMIN' || allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({ error: `Forbidden: Requires one of roles [${allowedRoles.join(', ')}]` });
  };
}
