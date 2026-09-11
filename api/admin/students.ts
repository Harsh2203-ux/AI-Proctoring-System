import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../db/client';
import { requireAdmin } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const skip = parseInt(req.query.skip as string) || 0;
  const limit = parseInt(req.query.limit as string) || 50;

  const students = await query(
    `SELECT u.id, u.email, u.role, u.is_active, u.created_at,
            sp.full_name, sp.student_id, sp.is_face_enrolled, sp.enrolled_at
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.role = 'student'
     ORDER BY u.created_at DESC
     OFFSET $1 LIMIT $2`,
    [skip, limit]
  );

  return res.status(200).json(students.map(s => ({
    ...s,
    _id: (s as Record<string,unknown>).id,
    profile: {
      full_name: (s as Record<string,unknown>).full_name,
      student_id: (s as Record<string,unknown>).student_id,
      is_face_enrolled: (s as Record<string,unknown>).is_face_enrolled,
    },
  })));
}
