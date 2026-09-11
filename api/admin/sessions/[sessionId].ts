import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../../db/client';
import { requireAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const sessionId = req.query.sessionId as string;

  const session = await queryOne(
    `SELECT ps.id, ps.attempt_id, ps.student_id, ps.exam_id, ps.status,
            ps.warning_count, ps.is_disqualified, ps.disqualification_reason, ps.demo_mode,
            ps.started_at, ps.ended_at,
            sp.full_name AS student_name, sp.student_id AS student_student_id,
            u.email AS student_email,
            e.title AS exam_title, e.duration_minutes AS exam_duration_minutes
     FROM proctoring_sessions ps
     LEFT JOIN student_profiles sp ON sp.user_id = ps.student_id
     LEFT JOIN users u ON u.id = ps.student_id
     LEFT JOIN exams e ON e.id = ps.exam_id
     WHERE ps.id = $1`,
    [sessionId]
  );
  if (!session) return res.status(404).json({ detail: 'Session not found' });

  const violations = await query(
    `SELECT v.id, v.violation_type, v.severity, v.confidence, v.status,
            v.warning_number, v.is_demo, v.metadata, v.created_at,
            sp.full_name AS student_name
     FROM violations v
     LEFT JOIN student_profiles sp ON sp.user_id = v.student_id
     WHERE v.session_id = $1 ORDER BY v.created_at DESC`,
    [sessionId]
  );

  const [eventRow] = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM proctoring_events WHERE session_id = $1', [sessionId]
  );

  const s = session as Record<string, unknown>;
  let duration_seconds: number | null = null;
  if (s.started_at && s.ended_at) {
    duration_seconds = Math.floor(
      (new Date(s.ended_at as string).getTime() - new Date(s.started_at as string).getTime()) / 1000
    );
  }

  return res.status(200).json({
    ...session,
    _id: s.id,
    violations: violations.map(v => ({ ...v, _id: (v as Record<string,unknown>).id })),
    event_count: parseInt(eventRow?.count || '0'),
    duration_seconds,
  });
}
