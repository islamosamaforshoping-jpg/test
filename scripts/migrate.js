import dotenv from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openDatabase, transaction } from '../server/db.js';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const db = openDatabase();

try {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);

  const appliedRows = (await db.query('SELECT version FROM schema_migrations')).rows;
  const appliedVersions = new Set(appliedRows.map(r => Number(r.version)));

  const migrationsDir = resolve(process.cwd(), 'migrations');
  const files = (await readdir(migrationsDir)).sort();

  const applied = [];
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const match = file.match(/^(\d+)_/);
    if (!match) continue;
    const version = parseInt(match[1], 10);
    if (appliedVersions.has(version)) continue;

    let sql = await readFile(resolve(migrationsDir, file), 'utf8');

    // Strip transaction statements if nested, or handle Postgres constraints stripping
    sql = sql.replace(/^\s*BEGIN\s*;\s*/gmi, '').replace(/\s*COMMIT\s*;\s*$/gmi, '');
    sql = sql.replace(/ALTER TABLE \w+ DROP CONSTRAINT [^;]+;/gi, '');
    sql = sql.replace(/ALTER TABLE \w+ ADD CONSTRAINT [^;]+;/gi, '');

    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);

    await transaction(db, async () => {
      for (const statement of statements) {
        await db.query(statement);
      }
      await db.query('INSERT INTO schema_migrations(version) VALUES(?) ON CONFLICT(version) DO NOTHING', [version]);
    });
    applied.push(version);
  }

  if (applied.length) {
    console.log(`Applied database migration(s): ${applied.join(', ')}.`);
  } else {
    console.log('Database schema is up to date.');
  }
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await db.close();
}
