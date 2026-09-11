import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne } from '../../db/client';
import { requireAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const studentId = req.query.studentId as string;

  const student = await queryOne(
    `SELECT u.id, u.email, u.role, u.is_active, u.created_at,
            sp.full_name, sp.student_id, sp.is_face_enrolled, sp.enrolled_at
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1`,
    [studentId]
  );
  if (!student) return res.status(404).json({ detail: 'Student not found' });

  return res.status(200).json({
    ...student,
    _id: (student as Record<string,unknown>).id,
    profile: {
      full_name: (student as Record<string,unknown>).full_name,
      student_id: (student as Record<string,unknown>).student_id,
      is_face_enrolled: (student as Record<string,unknown>).is_face_enrolled,
    },
  });
}
