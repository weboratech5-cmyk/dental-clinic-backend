import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthenticatedRequest, AuthTokenPayload, UserRole } from '../types/auth.js';

export const requireAuth: RequestHandler = (request, response, next) => {
  const authorization = request.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  try {
    const token = authorization.slice('Bearer '.length);
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;

    if (!payload.userId || !payload.role) {
      response.status(401).json({ status: 'error', message: 'Invalid token' });
      return;
    }

    (request as AuthenticatedRequest).auth = payload;
    next();
  } catch {
    response.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, response, next) => {
    const auth = (request as AuthenticatedRequest).auth;

    if (!auth || !roles.includes(auth.role)) {
      response.status(403).json({ status: 'error', message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
