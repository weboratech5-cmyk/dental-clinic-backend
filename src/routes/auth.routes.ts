import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest, UserRole } from '../types/auth.js';

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  phone: string | null;
  status: 'active' | 'inactive';
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts. Please try again later.' },
});

function publicUser(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    phone: user.phone,
    status: user.status,
    last_login: user.last_login,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        status: 'error',
        message: parsed.error.issues[0]?.message ?? 'Invalid login data',
      });
      return;
    }

    const { login, password } = parsed.data;
    const [users] = await db.execute<UserRow[]>(
      `SELECT id, name, username, email, password_hash, role, phone, status, last_login, created_at, updated_at
       FROM app_users
       WHERE email = ? OR username = ?
       LIMIT 1`,
      [login, login],
    );

    const user = users[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !passwordMatches) {
      response.status(401).json({ status: 'error', message: 'Invalid username/email or password' });
      return;
    }

    if (user.status !== 'active') {
      response.status(403).json({ status: 'error', message: 'This account is inactive' });
      return;
    }

    const options: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
      subject: user.id,
    };
    const token = jwt.sign({ userId: user.id, role: user.role }, env.JWT_SECRET, options);

    await db.execute<ResultSetHeader>('UPDATE app_users SET last_login = NOW() WHERE id = ?', [user.id]);

    response.json({ status: 'ok', token, user: publicUser({ ...user, last_login: new Date() }) });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (request, response, next) => {
  try {
    const { userId } = (request as AuthenticatedRequest).auth;
    const [users] = await db.execute<UserRow[]>(
      `SELECT id, name, username, email, password_hash, role, phone, status, last_login, created_at, updated_at
       FROM app_users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );

    const user = users[0];
    if (!user || user.status !== 'active') {
      response.status(401).json({ status: 'error', message: 'User account is unavailable' });
      return;
    }

    response.json({ status: 'ok', user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});
