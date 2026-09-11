import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne, query } from '../db/client';
import { requireStudent } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const student = requireStudent(req, res);
  if (!student) return;

  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ detail: 'session_id required' });

  const session = await queryOne<{
    id: string; student_id: string; status: string;
    warning_count: number; is_disqualified: boolean; disqualification_reason: string | null;
    demo_mode: boolean;
  }>(
    `SELECT id, student_id, status, warning_count, is_disqualified,
            disqualification_reason, demo_mode
     FROM proctoring_sessions WHERE id = $1`,
    [session_id]
  );
  if (!session) return res.status(404).json({ detail: 'Session not found' });
  if (session.student_id !== student.sub) return res.status(403).json({ detail: 'Forbidden' });

  // Keep session alive (update a heartbeat-style timestamp would go here if we had one)
  // Return current state so frontend can react to disqualification
  return res.status(200).json({
    session_id,
    status: session.status,
    warning_count: session.warning_count,
    is_disqualified: session.is_disqualified,
    disqualification_reason: session.disqualification_reason,
    demo_mode: session.demo_mode,
    timestamp: new Date().toISOString(),
  });
}
