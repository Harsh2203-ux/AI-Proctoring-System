import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../../db/client';
import { requireAdmin } from '../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const days = parseInt(req.query.days as string) || 7;
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [row] = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM violations WHERE created_at >= $1 AND created_at < $2`,
      [dayStart.toISOString(), dayEnd.toISOString()]
    );
    result.push({
      date: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      count: parseInt(row?.count || '0'),
    });
  }

  return res.status(200).json(result);
}
