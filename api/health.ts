import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne } from './db/client';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  let dbOk = false;
  try {
    await queryOne('SELECT 1 as ok');
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString(),
  });
}
