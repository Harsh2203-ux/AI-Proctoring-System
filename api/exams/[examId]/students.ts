import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../../db/client';
import { requireAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const examId = req.query.examId as string;

  // POST /api/exams/:examId/students — assign students
  if (req.method === 'POST') {
    const studentIds: string[] = req.body;
    if (!Array.isArray(studentIds)) return res.status(400).json({ detail: 'Expected array of student IDs' });

    // Use PostgreSQL array concatenation, deduplicating
    await query(
      `UPDATE exams
       SET allowed_students = ARRAY(
         SELECT DISTINCT unnest(allowed_students || $1::text[])
       ), updated_at = NOW()
       WHERE id = $2`,
      [studentIds, examId]
    );
    return res.status(200).json({ message: `Assigned ${studentIds.length} students` });
  }

  return res.status(405).json({ detail: 'Method not allowed' });
}
