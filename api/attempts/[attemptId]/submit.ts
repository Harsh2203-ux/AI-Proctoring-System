import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../../db/client';
import { requireStudent } from '../../_lib/auth';
import { generateReport } from '../../_lib/report';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const student = requireStudent(req, res);
  if (!student) return;

  const attemptId = req.query.attemptId as string;

  const attempt = await queryOne<{ student_id: string; status: string }>(
    'SELECT student_id, status FROM exam_attempts WHERE id = $1', [attemptId]
  );
  if (!attempt) return res.status(404).json({ detail: 'Attempt not found' });
  if (attempt.student_id !== student.sub) return res.status(403).json({ detail: 'Access denied' });
  if (attempt.status !== 'in_progress') {
    return res.status(400).json({ detail: `Attempt already ${attempt.status}` });
  }

  // Submit attempt
  await query(
    `UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`,
    [attemptId]
  );
  await query(
    `UPDATE answers SET is_final = TRUE WHERE attempt_id = $1`,
    [attemptId]
  );
  await query(
    `UPDATE proctoring_sessions SET status = 'ended', ended_at = NOW() WHERE attempt_id = $1`,
    [attemptId]
  );

  // Generate report asynchronously (best effort, don't block response)
  const session = await queryOne<{ id: string }>(
    'SELECT id FROM proctoring_sessions WHERE attempt_id = $1', [attemptId]
  );
  if (session) {
    generateReport(session.id).catch(console.error);
  }

  return res.status(200).json({ message: 'Exam submitted successfully' });
}
