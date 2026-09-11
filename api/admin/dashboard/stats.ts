import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne } from '../../db/client';
import { requireAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalExams, activeExams, totalStudents, activeSessions,
    violationsToday, disqToday, totalViolations, totalReports, pendingReviews,
  ] = await Promise.all([
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM exams'),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM exams WHERE status = 'active'`),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM users WHERE role = 'student'`),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM proctoring_sessions WHERE status = 'active'`),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM violations WHERE created_at >= $1`, [today.toISOString()]),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM disqualifications WHERE disqualified_at >= $1`, [today.toISOString()]),
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM violations'),
    queryOne<{ count: string }>('SELECT COUNT(*) as count FROM proctoring_reports'),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM violations WHERE status = 'open' AND severity IN ('high','critical')`),
  ]);

  return res.status(200).json({
    total_exams:           parseInt(totalExams?.count || '0'),
    active_exams:          parseInt(activeExams?.count || '0'),
    total_students:        parseInt(totalStudents?.count || '0'),
    active_sessions:       parseInt(activeSessions?.count || '0'),
    violations_today:      parseInt(violationsToday?.count || '0'),
    disqualifications_today: parseInt(disqToday?.count || '0'),
    total_violations:      parseInt(totalViolations?.count || '0'),
    total_reports:         parseInt(totalReports?.count || '0'),
    pending_reviews:       parseInt(pendingReviews?.count || '0'),
  });
}
