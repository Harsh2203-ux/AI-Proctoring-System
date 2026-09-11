import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne } from '../db/client';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const profile = await queryOne(
    `SELECT sp.id, sp.user_id, sp.full_name, sp.student_id, sp.is_face_enrolled, sp.enrolled_at, sp.created_at
     FROM student_profiles sp WHERE sp.user_id = $1`,
    [user.sub]
  );
  if (!profile) return res.status(404).json({ detail: 'Profile not found' });

  return res.status(200).json({ ...profile, _id: (profile as Record<string,unknown>).id });
}
