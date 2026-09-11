import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { requireAuth } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  const attemptId = req.query.attemptId as string;

  // GET /api/attempts/:attemptId
  if (req.method === 'GET') {
    const attempt = await queryOne<{
      id: string; exam_id: string; student_id: string; status: string;
      started_at: string; submitted_at: string | null; time_remaining_seconds: number;
    }>(
      `SELECT id, exam_id, student_id, status, started_at, submitted_at, time_remaining_seconds
       FROM exam_attempts WHERE id = $1`,
      [attemptId]
    );
    if (!attempt) return res.status(404).json({ detail: 'Attempt not found' });

    if (user.role !== 'admin' && attempt.student_id !== user.sub) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    // Recompute time remaining for in-progress attempts
    if (attempt.status === 'in_progress') {
      const exam = await queryOne<{ duration_minutes: number }>(
        'SELECT duration_minutes FROM exams WHERE id = $1', [attempt.exam_id]
      );
      const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
      const remaining = Math.max(0, (exam?.duration_minutes || 60) * 60 - elapsed);
      (attempt as Record<string,unknown>).time_remaining_seconds = remaining;

      if (remaining === 0) {
        await query(
          `UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`,
          [attemptId]
        );
        await query(
          `UPDATE proctoring_sessions SET status = 'ended', ended_at = NOW() WHERE attempt_id = $1`,
          [attemptId]
        );
        (attempt as Record<string,unknown>).status = 'submitted';
      }
    }

    return res.status(200).json({ ...attempt, _id: attempt.id });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
