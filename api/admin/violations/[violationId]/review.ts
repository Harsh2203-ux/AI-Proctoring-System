import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../../../db/client';
import { requireAdmin } from '../../../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== 'PUT') return res.status(405).json({ detail: 'Method not allowed' });

  const violationId = req.query.violationId as string;
  const { status = 'reviewed', review_notes = '' } = req.body || {};

  const result = await query(
    `UPDATE violations SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = NOW()
     WHERE id = $4 RETURNING id`,
    [status, review_notes, admin.sub, violationId]
  );
  if (!result.length) return res.status(404).json({ detail: 'Violation not found' });
  return res.status(200).json({ message: 'Violation reviewed' });
}
