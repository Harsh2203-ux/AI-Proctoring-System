import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../../db/client';
import { hashPassword, validatePassword } from '../../_lib/password';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const { full_name, email, student_id, password, confirm_password } = req.body || {};

  // Validate inputs
  if (!full_name?.trim() || full_name.trim().length < 2) {
    return res.status(400).json({ detail: 'Full name must be at least 2 characters' });
  }
  if (!student_id?.trim()) {
    return res.status(400).json({ detail: 'Student ID is required' });
  }
  if (!email) return res.status(400).json({ detail: 'Email is required' });

  const pwErr = validatePassword(password || '', confirm_password || '');
  if (pwErr) return res.status(400).json({ detail: pwErr });

  // Check email uniqueness
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1', [email.toLowerCase()]
  );
  if (existing) return res.status(400).json({ detail: 'Email already registered' });

  // Check student_id uniqueness
  const existingProfile = await queryOne<{ id: string }>(
    'SELECT id FROM student_profiles WHERE student_id = $1', [student_id.trim()]
  );
  if (existingProfile) return res.status(400).json({ detail: 'Student ID already registered' });

  const password_hash = await hashPassword(password);

  // Insert user
  const [user] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, is_active)
     VALUES ($1, $2, 'student', true) RETURNING id`,
    [email.toLowerCase(), password_hash]
  );

  // Insert student profile
  await query(
    `INSERT INTO student_profiles (user_id, full_name, student_id) VALUES ($1, $2, $3)`,
    [user.id, full_name.trim(), student_id.trim()]
  );

  return res.status(201).json({ message: 'Registration successful', user_id: user.id });
}
