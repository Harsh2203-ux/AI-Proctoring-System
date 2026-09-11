import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-jwt-secret';
const JWT_EXPIRES_IN = '60m';
const JWT_REFRESH_EXPIRES_IN = '7d';

export interface JwtPayload {
  sub: string;   // user id (UUID)
  email: string;
  role: 'student' | 'admin';
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export function createAccessToken(payload: Omit<JwtPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function createRefreshToken(payload: Omit<JwtPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Extract Bearer token from Authorization header. */
export function extractToken(req: VercelRequest): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/** Get authenticated user from request. Returns null if not authenticated. */
export function getUser(req: VercelRequest): JwtPayload | null {
  const token = extractToken(req);
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload || payload.type !== 'access') return null;
  return payload;
}

/** Middleware: require authentication. Returns user or sends 401. */
export function requireAuth(req: VercelRequest, res: VercelResponse): JwtPayload | null {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ detail: 'Authentication required' });
    return null;
  }
  return user;
}

/** Middleware: require admin role. */
export function requireAdmin(req: VercelRequest, res: VercelResponse): JwtPayload | null {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ detail: 'Admin access required' });
    return null;
  }
  return user;
}

/** Middleware: require student role. */
export function requireStudent(req: VercelRequest, res: VercelResponse): JwtPayload | null {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'student') {
    res.status(403).json({ detail: 'Student access required' });
    return null;
  }
  return user;
}
