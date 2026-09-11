import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../../db/client';
import { requireAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const examId = req.query.examId as string;
  const result = await query(
    `UPDATE exams SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING id`,
    [examId]
  );
  if (!result.length) return res.status(404).json({ detail: 'Exam not found' });
  return res.status(200).json({ message: 'Exam published' });
}
