import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOne } from './db/client';
import { ensureDb } from './db/init';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  let dbOk = false;
  let initError: string | null = null;
  try {
    await ensureDb();
    await queryOne('SELECT 1 as ok');
    dbOk = true;
  } catch (err) {
    dbOk = false;
    initError = err instanceof Error ? err.message : String(err);
  }

  return res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'unavailable',
    ...(initError ? { error: initError } : {}),
    timestamp: new Date().toISOString(),
  });
}
