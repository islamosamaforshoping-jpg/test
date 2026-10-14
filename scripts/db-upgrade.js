import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('Set TURSO_DATABASE_URL, DATABASE_URL_LOCAL, or DATABASE_URL in .env.local before upgrading.');
}

const client = createClient({ url, authToken });
const migrations = new Map([
  [13, 'ai_chat'],
  [14, 'ai_pending_actions']
]);

try {
  const tx = await client.transaction('write');
  try {
    const applied = [];
    for (const [version, name] of migrations) {
      const existing = await tx.execute({
        sql: 'SELECT version FROM schema_migrations WHERE version=?',
        args: [version]
      });
      if (existing.rows.length) continue;
      const migration = await readFile(
        resolve(process.cwd(), 'migrations', `${String(version).padStart(4, '0')}_${name}.sql`),
        'utf8'
      );
      const cleaned = migration
        .replace(/^\s*BEGIN\s*;\s*/i, '')
        .replace(/\s*COMMIT\s*;\s*$/i, '')
        .replace(/to_char\(clock_timestamp\(\) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"'\)/g, "strftime('%Y-%m-%dT%H:%M:%fZ','now')");

      // Split multiple SQL statements by semicolon if needed
      const statements = cleaned.split(';').map(s => s.trim()).filter(Boolean);
      for (const sql of statements) {
        await tx.execute(sql);
      }
      await tx.execute({
        sql: 'INSERT INTO schema_migrations(version) VALUES(?)',
        args: [version]
      });
      applied.push(version);
    }
    await tx.commit();
    console.log(applied.length
      ? `Applied database migration(s): ${applied.join(', ')}.`
      : 'AI chat database migrations are already applied.');
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
} finally {
  client.close();
}
