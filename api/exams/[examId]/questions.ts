import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../../db/client';
import { requireAuth, requireAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  const examId = req.query.examId as string;

  // GET /api/exams/:examId/questions
  if (req.method === 'GET') {
    const rows = await query(
      `SELECT id, exam_id, "order", question_type, text, options, marks, created_at
       FROM questions WHERE exam_id = $1 ORDER BY "order" ASC`,
      [examId]
    );
    return res.status(200).json(rows.map(q => ({ ...q, _id: (q as Record<string,unknown>).id })));
  }

  // POST /api/exams/:examId/questions
  if (req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { question_type = 'mcq', text, options, correct_answer, marks = 1, order } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ detail: 'Question text is required' });

    // Get current count for auto-order
    const [cnt] = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM questions WHERE exam_id = $1', [examId]
    );
    const questionOrder = order ?? (parseInt(cnt?.count || '0') + 1);

    const [q] = await query<{ id: string }>(
      `INSERT INTO questions (exam_id, "order", question_type, text, options, correct_answer, marks)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [examId, questionOrder, question_type, text.trim(),
       options ? JSON.stringify(options) : null, correct_answer || null, marks]
    );

    return res.status(201).json({ id: q.id, message: 'Question added' });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
