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
  role: z.enum(['ATTENDEE', 'ORGANISER', 'STAFF', 'ADMIN']).default('ATTENDEE'),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function createToken(user: AuthUser): string {
  return jwt.sign(user, config.JWT_SECRET, { expiresIn: '7d' });
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

    const token = createToken(authUser);
    res.status(201).json({ user: authUser, token });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
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

    const token = createToken(authUser);
    res.json({ user: authUser, token });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    console.error('[Auth Login Error]', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed' });
  }
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
