import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../../db/client';
import { hashPassword, validatePassword } from '../../_lib/password';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const { full_name, email, admin_id, password, confirm_password } = req.body || {};

  if (!full_name?.trim() || full_name.trim().length < 2) {
    return res.status(400).json({ detail: 'Full name must be at least 2 characters' });
  }
  if (!admin_id?.trim()) {
    return res.status(400).json({ detail: 'Administrator ID is required' });
  }
  if (!email) return res.status(400).json({ detail: 'Email is required' });

  const pwErr = validatePassword(password || '', confirm_password || '');
  if (pwErr) return res.status(400).json({ detail: pwErr });

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1', [email.toLowerCase()]
  );
  if (existing) return res.status(400).json({ detail: 'Email already registered' });

  const existingProfile = await queryOne<{ id: string }>(
    'SELECT id FROM admin_profiles WHERE admin_id = $1', [admin_id.trim()]
  );
  if (existingProfile) return res.status(400).json({ detail: 'Administrator ID already registered' });

  const password_hash = await hashPassword(password);

  const [user] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, is_active)
     VALUES ($1, $2, 'admin', true) RETURNING id`,
    [email.toLowerCase(), password_hash]
  );

  await query(
    `INSERT INTO admin_profiles (user_id, full_name, admin_id) VALUES ($1, $2, $3)`,
    [user.id, full_name.trim(), admin_id.trim()]
  );

  return res.status(201).json({ message: 'Administrator account created successfully', user_id: user.id });
}
