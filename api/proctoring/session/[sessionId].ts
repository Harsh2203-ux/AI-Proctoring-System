import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne } from '../../db/client';
import { requireAuth } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const sessionId = req.query.sessionId as string;

  const session = await queryOne(
    `SELECT id, status, warning_count, is_disqualified, disqualification_reason,
            demo_mode, started_at, ended_at
     FROM proctoring_sessions WHERE id = $1`,
    [sessionId]
  );
  if (!session) return res.status(404).json({ detail: 'Session not found' });

  return res.status(200).json({ ...session, _id: (session as Record<string,unknown>).id });
}
