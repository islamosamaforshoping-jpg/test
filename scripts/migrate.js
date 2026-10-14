import dotenv from 'dotenv';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const sourcePath = resolve(process.argv[2] || 'data/course.sqlite');
const tableOrder = [
  'courses', 'levels', 'users', 'groups_table', 'course_settings', 'level_course_prices',
  'students', 'enrollments', 'subjects', 'course_sessions', 'attendance', 'payments',
  'auth_sessions', 'audit_logs', 'schema_migrations', 'notifications', 'course_lectures',
  'exams', 'exam_questions', 'exam_attempts', 'exam_attempt_questions', 'exam_answers',
  'exam_integrity_events', 'certificates', 'exam_certificates', 'course_materials', 'system_wipe_requests'
];
const identityTables = new Set([
  'courses', 'levels', 'groups_table', 'users', 'students', 'enrollments',
  'course_sessions', 'attendance', 'payments', 'audit_logs', 'notifications',
  'course_settings', 'subjects', 'course_lectures', 'exams', 'exam_questions',
  'exam_attempts', 'exam_attempt_questions', 'exam_answers', 'exam_integrity_events',
  'certificates', 'exam_certificates', 'course_materials'
]);
const quoteIdentifier = identifier => `"${identifier.replaceAll('"', '""')}"`;

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('Set TURSO_DATABASE_URL, DATABASE_URL_LOCAL, or DATABASE_URL in .env.local before migrating.');
}

const source = new DatabaseSync(sourcePath, { readOnly: true });
const client = createClient({ url, authToken });

try {
  const tableDefinitions = source.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all();
  const definitions = new Map(tableDefinitions.map(item => [item.name, item.sql]));
  const optionalTables = new Set(['certificates', 'exam_certificates', 'course_materials', 'system_wipe_requests']);
  const missing = tableOrder.filter(name => !definitions.has(name) && !optionalTables.has(name));
  if (missing.length) throw new Error(`The local SQLite database is missing tables: ${missing.join(', ')}`);

  const existingMigration = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='neon_data_migrations'"
  );
  const schemaMigrationsExist = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
  );
  const schemaVersions = new Set();
  if (schemaMigrationsExist.rows.length) {
    const res = await client.execute('SELECT version FROM schema_migrations');
    res.rows.forEach(row => schemaVersions.add(Number(row.version)));
  }

  const requiredVersions = [7, 8, 9, 10, 11, 12, 13, 14];
  const pendingVersions = requiredVersions.filter(version => !schemaVersions.has(version));

  if (existingMigration.rows.length) {
    const migrated = await client.execute(
      "SELECT 1 FROM neon_data_migrations WHERE name='course-sqlite-v1'"
    );
    if (migrated.rows.length && !pendingVersions.length) {
      console.log('Migration already completed; no rows were changed.');
      process.exitCode = 0;
    } else if (!migrated.rows.length) {
      throw new Error('A previous migration schema exists without a completion record; refusing to overwrite data.');
    }
  }

  if (existingMigration.rows.length && pendingVersions.length) {
    const tx = await client.transaction('write');
    try {
      for (const version of pendingVersions) {
        if (schemaVersions.has(version)) continue;
        const migration = await readFile(resolve(process.cwd(), 'migrations', `${String(version).padStart(4, '0')}_${({
          7: 'student_certificates',
          8: 'course_materials',
          9: 'system_wipe_requests',
          10: 'doctor_role',
          11: 'restore_known_staff_names',
          12: 'exam_certificates',
          13: 'ai_chat',
          14: 'ai_pending_actions'
        })[version]}.sql`), 'utf8');
        const statements = migration
          .replace(/^\s*BEGIN\s*;\s*/i, '')
          .replace(/\s*COMMIT\s*;\s*$/i, '')
          .replace(/to_char\(clock_timestamp\(\) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"'\)/g, "strftime('%Y-%m-%dT%H:%M:%fZ','now')")
          .split(';')
          .map(s => s.trim())
          .filter(Boolean);
        for (const stmt of statements) {
          await tx.execute(stmt);
        }
        await tx.execute({
          sql: 'INSERT INTO schema_migrations(version) VALUES(?) ON CONFLICT(version) DO NOTHING',
          args: [version]
        });
        schemaVersions.add(version);
      }
      await tx.commit();
      console.log(`Applied ${pendingVersions.length} pending migration(s): ${pendingVersions.join(', ')}`);
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  } else if (!existingMigration.rows.length) {
    const tx = await client.transaction('write');
    try {
      for (const name of tableOrder) {
        if (definitions.has(name)) await tx.execute(definitions.get(name));
      }
      for (const { sql } of source.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type='index' AND sql IS NOT NULL ORDER BY name
      `).all()) {
        await tx.execute(sql);
      }
      await tx.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username))');
      await tx.execute(`CREATE TABLE IF NOT EXISTS neon_data_migrations (
        name TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL
      )`);

      const counts = {};
      for (const table of tableOrder) {
        if (!definitions.has(table)) {
          counts[table] = 0;
          continue;
        }
        const columns = source.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map(column => column.name);
        const rows = table === 'auth_sessions' ? [] : source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
        counts[table] = rows.length;
        if (!rows.length) continue;
        const columnList = columns.map(quoteIdentifier).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const insert = `INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES (${placeholders})`;
        for (const row of rows) {
          await tx.execute({ sql: insert, args: columns.map(column => row[column]) });
        }
      }

      for (const table of tableOrder) {
        if (identityTables.has(table) && counts[table]) {
          const maxIdRes = source.prepare(`SELECT MAX(id) as max_id FROM ${quoteIdentifier(table)}`).get();
          if (maxIdRes?.max_id) {
            await tx.execute({
              sql: "INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)",
              args: [table, maxIdRes.max_id]
            });
          }
        }
      }

      await tx.execute(
        `INSERT INTO neon_data_migrations(name,completed_at)
         VALUES('course-sqlite-v1', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
      );
      await tx.commit();
      console.log(`Migrated ${Object.values(counts).reduce((sum, count) => sum + count, 0)} records from ${sourcePath}.`);
      for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count}`);
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
} finally {
  source.close();
  client.close();
}
