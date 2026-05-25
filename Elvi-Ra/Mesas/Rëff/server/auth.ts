import jwt from 'jsonwebtoken';
import { getUserById, getUserAgents } from './db.js';
import { Request, Response, NextFunction } from 'express';

const DEV_JWT_SECRET = 'snfi-dev-secret-local-only';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatoria en produccion.');
  }
  console.warn('[WARN] JWT_SECRET no esta definida. Usando secreto local solo para desarrollo.');
}

export function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    return jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  agents: string[];
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token ausente' });
  }
  const payload = verifyToken(token) as { userId?: string } | null;
  if (!payload) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  const userRow = getUserById(payload.userId!);
  if (!userRow) {
    return res.status(401).json({ error: 'Usuario no encontrado' });
  }
  req.user = {
    id: userRow.id,
    username: userRow.username,
    displayName: userRow.display_name,
    avatarUrl: userRow.avatar_url ?? null,
    agents: getUserAgents(userRow.id),
  };
  next();
}
