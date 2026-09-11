import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../db/client';
import { requireAdmin } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const skip  = parseInt(req.query.skip  as string) || 0;
  const limit = parseInt(req.query.limit as string) || 50;

  const rows = await query(
    `SELECT d.id, d.session_id, d.student_id, d.exam_id, d.reason,
            d.disqualified_at, d.review_status,
            sp.full_name AS student_name,
            e.title AS exam_title
     FROM disqualifications d
     LEFT JOIN student_profiles sp ON sp.user_id = d.student_id
     LEFT JOIN exams e ON e.id = d.exam_id
     ORDER BY d.disqualified_at DESC OFFSET $1 LIMIT $2`,
    [skip, limit]
  );

  return res.status(200).json(rows.map(d => ({ ...d, _id: (d as Record<string,unknown>).id })));
}
