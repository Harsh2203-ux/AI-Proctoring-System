import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { requireAdmin } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const skip   = parseInt(req.query.skip   as string) || 0;
  const limit  = parseInt(req.query.limit  as string) || 50;
  const severity  = req.query.severity  as string | undefined;
  const status    = req.query.status    as string | undefined;
  const exam_id   = req.query.exam_id   as string | undefined;
  const student_id = req.query.student_id as string | undefined;

  const conds: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (severity)   { conds.push(`v.severity = $${idx++}`);    params.push(severity); }
  if (status)     { conds.push(`v.status = $${idx++}`);      params.push(status); }
  if (exam_id)    { conds.push(`v.exam_id = $${idx++}`);     params.push(exam_id); }
  if (student_id) { conds.push(`v.student_id = $${idx++}`);  params.push(student_id); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rows = await query(
    `SELECT v.id, v.session_id, v.student_id, v.exam_id, v.violation_type, v.severity,
            v.confidence, v.status, v.warning_number, v.is_demo, v.metadata, v.created_at,
            sp.full_name AS student_name
     FROM violations v
     LEFT JOIN student_profiles sp ON sp.user_id = v.student_id
     ${where}
     ORDER BY v.created_at DESC OFFSET $${idx} LIMIT $${idx + 1}`,
    [...params, skip, limit]
  );

  const [totalRow] = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM violations v ${where}`, params
  );

  return res.status(200).json({
    violations: rows.map(v => ({ ...v, _id: (v as Record<string,unknown>).id })),
    total: parseInt(totalRow?.count || '0'),
  });
}
