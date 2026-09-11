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
    `SELECT pr.id, pr.session_id, pr.student_id, pr.exam_id,
            pr.risk_score, pr.risk_level, pr.warning_count,
            pr.disqualification_status, pr.submission_status,
            pr.violation_summary, pr.generated_at,
            sp.full_name AS student_name,
            e.title AS exam_title
     FROM proctoring_reports pr
     LEFT JOIN student_profiles sp ON sp.user_id = pr.student_id
     LEFT JOIN exams e ON e.id = pr.exam_id
     ORDER BY pr.generated_at DESC OFFSET $1 LIMIT $2`,
    [skip, limit]
  );

  return res.status(200).json(rows.map(r => ({ ...r, _id: (r as Record<string,unknown>).id })));
}
