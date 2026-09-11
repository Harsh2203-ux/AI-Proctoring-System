import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Neon's serverless driver requires a WebSocket constructor when running in
// Node.js (Vercel serverless functions).  The browser environment provides
// WebSocket natively; Node.js does not — so we polyfill it here.
neonConfig.webSocketConstructor = ws;

// A module-level pool that is reused across invocations within the same
// Node.js process (Vercel's function warm instances share memory).
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

/** Run a query and return rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/** Run a query and return the first row or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
