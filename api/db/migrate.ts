/**
 * Database migration script.
 * Run once to set up the schema:
 *
 *   DATABASE_URL=postgres://... npx ts-node api/db/migrate.ts
 *   # or
 *   DATABASE_URL=postgres://... node -r ts-node/register api/db/migrate.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from '@neondatabase/serverless';

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('❌  DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    console.log('🔄  Running schema migration…');
    await client.query(schema);
    console.log('✅  Migration complete.');
  } catch (err) {
    console.error('❌  Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
