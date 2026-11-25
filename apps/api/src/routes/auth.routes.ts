import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../database.js';
import { config } from '../config.js';
import { authMiddleware, AuthUser } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  // Self-service sign-up only; STAFF and ADMIN are privileged and are never self-assigned.
  role: z.enum(['ATTENDEE', 'ORGANISER']).default('ATTENDEE'),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

function createTokens(user: AuthUser): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(user, config.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: user.id, typ: 'refresh' }, config.JWT_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

function createToken(user: AuthUser): string {
  return createTokens(user).accessToken;
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS', message: 'Email already registered' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const userRes = await query(
      `INSERT INTO users (email, password_hash, full_name, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role`,
      [data.email, passwordHash, data.fullName, data.role, data.phone || null]
    );

    const user = userRes.rows[0];

    // If organiser, also create organiser record
    if (data.role === 'ORGANISER') {
      await query(
        `INSERT INTO organisers (name, contact_email, owner_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [`${data.fullName}'s Organization`, data.email, user.id]
      );
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    };

    const { accessToken, refreshToken } = createTokens(authUser);
    setRefreshTokenCookie(res, refreshToken);
    res.status(201).json({ user: authUser, token: accessToken, accessToken });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.issues });
      return;
    }
    console.error('[Auth Register Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const userRes = await query(
      `SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1`,
      [data.email]
    );

    if (!userRes.rowCount || userRes.rowCount === 0) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(data.password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    };

    const { accessToken, refreshToken } = createTokens(authUser);
    setRefreshTokenCookie(res, refreshToken);
    res.json({ user: authUser, token: accessToken, accessToken });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.issues });
      return;
    }
    console.error('[Auth Login Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed' });
  }
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = (req.cookies?.refreshToken as string | undefined) || (req.body?.refreshToken as string | undefined);
    if (!rawToken) {
      clearRefreshTokenCookie(res);
      res.status(401).json({ error: 'MISSING_REFRESH_TOKEN', message: 'Refresh token is required' });
      return;
    }

    let payload: { id: string; typ?: string };
    try {
      payload = jwt.verify(rawToken, config.JWT_SECRET) as { id: string; typ?: string };
    } catch {
      clearRefreshTokenCookie(res);
      res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' });
      return;
    }

    const userRes = await query(
      `SELECT id, email, full_name, role FROM users WHERE id = $1`,
      [payload.id]
    );

    if (!userRes.rowCount || userRes.rowCount === 0) {
      clearRefreshTokenCookie(res);
      res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      return;
    }

    const user = userRes.rows[0];
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    };

    const { accessToken, refreshToken } = createTokens(authUser);
    setRefreshTokenCookie(res, refreshToken);
    res.json({ user: authUser, token: accessToken, accessToken });
  } catch (error) {
    console.error('[Auth Refresh Error]', error);
    clearRefreshTokenCookie(res);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Token refresh failed' });
  }
});

router.post('/logout', (_req: Request, res: Response): void => {
  clearRefreshTokenCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userRes = await query(
      `SELECT id, email, full_name, role, phone, created_at FROM users WHERE id = $1`,
      [req.user!.id]
    );

    if (!userRes.rowCount || userRes.rowCount === 0) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }

    res.json({ user: userRes.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
