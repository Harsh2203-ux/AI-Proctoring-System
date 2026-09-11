import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { hashPassword, validatePassword } from '../_lib/password';
import { createAccessToken, createRefreshToken, decodeToken } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  if (method === 'POST') {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ detail: 'Email and password are required' });
    }

    const user = await queryOne<{
      id: string; email: string; password_hash: string; role: string; is_active: boolean;
    }>(
      'SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    const { verifyPassword } = await import('../_lib/password');
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: 'Account is inactive' });
    }

    // Get full_name from profile
    let full_name = user.email;
    if (user.role === 'student') {
      const p = await queryOne<{ full_name: string }>(
        'SELECT full_name FROM student_profiles WHERE user_id = $1', [user.id]
      );
      if (p) full_name = p.full_name;
    } else if (user.role === 'admin') {
      const p = await queryOne<{ full_name: string }>(
        'SELECT full_name FROM admin_profiles WHERE user_id = $1', [user.id]
      );
      if (p) full_name = p.full_name;
    }

    const tokenData = { sub: user.id, email: user.email, role: user.role as 'student' | 'admin' };
    const access_token = createAccessToken(tokenData);
    const refresh_token = createRefreshToken(tokenData);

    return res.status(200).json({
      access_token,
      refresh_token,
      token_type: 'bearer',
      user: { id: user.id, email: user.email, role: user.role, full_name },
    });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
