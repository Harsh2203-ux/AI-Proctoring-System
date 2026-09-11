import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne } from '../../db/client';
import { requireAdmin } from '../../_lib/auth';
import { generateReport } from '../../_lib/report';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const sessionId = req.query.sessionId as string;

  let report = await queryOne(
    `SELECT pr.*, sp.full_name AS student_name, e.title AS exam_title
     FROM proctoring_reports pr
     LEFT JOIN student_profiles sp ON sp.user_id = pr.student_id
     LEFT JOIN exams e ON e.id = pr.exam_id
     WHERE pr.session_id = $1`,
    [sessionId]
  );

  if (!report) {
    const generated = await generateReport(sessionId);
    if (!generated) return res.status(404).json({ detail: 'Report not found' });
    report = generated;
  }

  return res.status(200).json({ ...report, _id: (report as Record<string,unknown>).id });
}
