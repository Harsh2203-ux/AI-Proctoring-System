import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../db/client';
import { requireAdmin } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const skip  = parseInt(req.query.skip  as string) || 0;
  const limit = parseInt(req.query.limit as string) || 50;
  const status = req.query.status as string | undefined;

  let sql = `
    SELECT ps.id, ps.attempt_id, ps.student_id, ps.exam_id, ps.status,
           ps.warning_count, ps.is_disqualified, ps.demo_mode,
           ps.started_at, ps.ended_at,
           sp.full_name AS student_name, sp.student_id AS student_student_id,
           e.title AS exam_title
    FROM proctoring_sessions ps
    LEFT JOIN student_profiles sp ON sp.user_id = ps.student_id
    LEFT JOIN exams e ON e.id = ps.exam_id
  `;
  const params: unknown[] = [];
  if (status) {
    sql += ` WHERE ps.status = $1`;
    params.push(status);
  }
  sql += ` ORDER BY ps.started_at DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`;
  params.push(skip, limit);

  const rows = await query(sql, params);
  return res.status(200).json(rows.map(s => ({ ...s, _id: (s as Record<string,unknown>).id })));
}
