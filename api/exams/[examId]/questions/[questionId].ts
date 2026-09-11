import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../../../db/client';
import { requireAdmin } from '../../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const { examId, questionId } = req.query as { examId: string; questionId: string };

  // PUT — update question
  if (req.method === 'PUT') {
    const { question_type, text, options, correct_answer, marks, order } = req.body || {};
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (question_type !== undefined) { updates.push(`question_type = $${idx++}`); params.push(question_type); }
    if (text !== undefined)          { updates.push(`text = $${idx++}`);           params.push(text); }
    if (options !== undefined)       { updates.push(`options = $${idx++}`);        params.push(options ? JSON.stringify(options) : null); }
    if (correct_answer !== undefined){ updates.push(`correct_answer = $${idx++}`); params.push(correct_answer); }
    if (marks !== undefined)         { updates.push(`marks = $${idx++}`);          params.push(marks); }
    if (order !== undefined)         { updates.push(`"order" = $${idx++}`);        params.push(order); }

    if (!updates.length) return res.status(400).json({ detail: 'Nothing to update' });
    params.push(questionId);

    const result = await query(
      `UPDATE questions SET ${updates.join(', ')} WHERE id = $${idx} AND exam_id = $${idx + 1} RETURNING id`,
      [...params, examId]
    );
    if (!result.length) return res.status(404).json({ detail: 'Question not found' });
    return res.status(200).json({ message: 'Question updated' });
  }

  // DELETE — delete question
  if (req.method === 'DELETE') {
    await query('DELETE FROM questions WHERE id = $1 AND exam_id = $2', [questionId, examId]);
    return res.status(200).json({ message: 'Question deleted' });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
