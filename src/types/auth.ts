import type { Request } from 'express';

export type UserRole = 'admin' | 'staff';

export interface AuthTokenPayload {
  userId: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthTokenPayload;
}
