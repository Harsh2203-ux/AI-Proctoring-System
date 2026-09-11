import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decodeToken, createAccessToken } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ detail: 'Refresh token required' });

  const payload = decodeToken(refresh_token);
  if (!payload || payload.type !== 'refresh') {
    return res.status(401).json({ detail: 'Invalid refresh token' });
  }

  const access_token = createAccessToken({ sub: payload.sub, email: payload.email, role: payload.role });
  return res.status(200).json({ access_token, token_type: 'bearer' });
}
