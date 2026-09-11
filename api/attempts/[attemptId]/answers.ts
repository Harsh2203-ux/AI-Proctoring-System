import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../../db/client';
import { requireStudent, requireAuth } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const attemptId = req.query.attemptId as string;

  // GET /api/attempts/:attemptId/answers
  if (req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;

    const attempt = await queryOne<{ student_id: string }>(
      'SELECT student_id FROM exam_attempts WHERE id = $1', [attemptId]
    );
    if (!attempt) return res.status(404).json({ detail: 'Attempt not found' });
    if (user.role !== 'admin' && attempt.student_id !== user.sub) {
      return res.status(403).json({ detail: 'Access denied' });
    }

    const answers = await query(
      `SELECT id, attempt_id, question_id, response, saved_at, is_final FROM answers WHERE attempt_id = $1`,
      [attemptId]
    );
    return res.status(200).json(answers.map(a => ({ ...a, _id: (a as Record<string,unknown>).id })));
  }

  // PUT /api/attempts/:attemptId/answers — save/upsert answers
  if (req.method === 'PUT') {
    const student = requireStudent(req, res);
    if (!student) return;

    const attempt = await queryOne<{ student_id: string; status: string }>(
      'SELECT student_id, status FROM exam_attempts WHERE id = $1', [attemptId]
    );
    if (!attempt) return res.status(404).json({ detail: 'Attempt not found' });
    if (attempt.student_id !== student.sub) return res.status(403).json({ detail: 'Access denied' });
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ detail: `Attempt is ${attempt.status}, cannot save answers` });
    }

    const answers: Array<{ question_id: string; response: string }> = req.body;
    if (!Array.isArray(answers)) return res.status(400).json({ detail: 'Expected array of answers' });

    for (const ans of answers) {
      await query(
        `INSERT INTO answers (attempt_id, question_id, response)
         VALUES ($1, $2, $3)
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET response = EXCLUDED.response, saved_at = NOW(), is_final = FALSE`,
        [attemptId, ans.question_id, ans.response || '']
      );
    }
    return res.status(200).json({ message: `Saved ${answers.length} answers` });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
