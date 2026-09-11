import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { requireAuth, requireAdmin } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  const examId = req.query.examId as string;
  if (!examId) return res.status(400).json({ detail: 'examId required' });

  // GET /api/exams/:examId
  if (req.method === 'GET') {
    const exam = await queryOne(
      `SELECT id, title, description, created_by, duration_minutes, start_time, end_time,
              allowed_students, status, proctoring_config, created_at, updated_at
       FROM exams WHERE id = $1`,
      [examId]
    );
    if (!exam) return res.status(404).json({ detail: 'Exam not found' });
    return res.status(200).json({ ...exam, _id: (exam as Record<string,unknown>).id });
  }

  // PUT /api/exams/:examId
  if (req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const body = req.body || {};
    if (body.title !== undefined)            { updates.push(`title = $${idx++}`);              params.push(body.title); }
    if (body.description !== undefined)      { updates.push(`description = $${idx++}`);         params.push(body.description); }
    if (body.duration_minutes !== undefined) { updates.push(`duration_minutes = $${idx++}`);    params.push(body.duration_minutes); }
    if (body.start_time !== undefined)       { updates.push(`start_time = $${idx++}`);          params.push(body.start_time); }
    if (body.end_time !== undefined)         { updates.push(`end_time = $${idx++}`);            params.push(body.end_time); }
    if (body.proctoring_config !== undefined){ updates.push(`proctoring_config = $${idx++}`);   params.push(JSON.stringify(body.proctoring_config)); }
    if (body.allowed_students !== undefined) { updates.push(`allowed_students = $${idx++}`);    params.push(body.allowed_students); }

    if (updates.length === 0) return res.status(400).json({ detail: 'No fields to update' });
    updates.push(`updated_at = NOW()`);
    params.push(examId);

    const result = await query(`UPDATE exams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`, params);
    if (!result.length) return res.status(404).json({ detail: 'Exam not found' });
    return res.status(200).json({ message: 'Exam updated' });
  }

  // DELETE /api/exams/:examId
  if (req.method === 'DELETE') {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const exam = await queryOne<{ status: string }>(
      'SELECT status FROM exams WHERE id = $1', [examId]
    );
    if (!exam) return res.status(404).json({ detail: 'Exam not found' });
    if (exam.status !== 'draft') return res.status(400).json({ detail: 'Only draft exams can be deleted' });

    await query('DELETE FROM exams WHERE id = $1', [examId]);
    return res.status(200).json({ message: 'Exam deleted' });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
