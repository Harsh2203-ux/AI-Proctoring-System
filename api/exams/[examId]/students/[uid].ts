import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../../../db/client';
import { requireAdmin } from '../../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== 'DELETE') return res.status(405).json({ detail: 'Method not allowed' });

  const { examId, uid } = req.query as { examId: string; uid: string };

  await query(
    `UPDATE exams
     SET allowed_students = ARRAY_REMOVE(allowed_students, $1), updated_at = NOW()
     WHERE id = $2`,
    [uid, examId]
  );
  return res.status(200).json({ message: 'Student removed' });
}
