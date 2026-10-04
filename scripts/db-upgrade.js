import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const connectionString = process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL || process.env.DATABASE_URL_LOCAL;
if (!connectionString) {
  throw new Error('Set DATABASE_URL_UNPOOLED, DATABASE_URL, or DATABASE_URL_LOCAL in .env.local before upgrading.');
}

const pool = new pg.Pool({ connectionString });
const migrations = new Map([
  [13, 'ai_chat'],
  [14, 'ai_pending_actions']
]);

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const applied = [];
    for (const [version, name] of migrations) {
      const existing = await client.query(
        'SELECT version FROM schema_migrations WHERE version=$1',
        [version]
      );
      if (existing.rowCount) continue;
      const migration = await readFile(
        resolve(process.cwd(), 'migrations', `${String(version).padStart(4, '0')}_${name}.sql`),
        'utf8'
      );
      await client.query(migration
        .replace(/^\s*BEGIN\s*;\s*/i, '')
        .replace(/\s*COMMIT\s*;\s*$/i, ''));
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      applied.push(version);
    }
    await client.query('COMMIT');
    console.log(applied.length
      ? `Applied database migration(s): ${applied.join(', ')}.`
      : 'AI chat database migrations are already applied.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
