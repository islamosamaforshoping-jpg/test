import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit, transaction } from './db.js';

export class DatabaseBackupError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const tables = [
  'courses', 'levels', 'users', 'groups_table', 'course_settings', 'level_course_prices',
  'students', 'enrollments', 'subjects', 'course_sessions', 'attendance', 'payments',
  'auth_sessions', 'audit_logs', 'schema_migrations', 'notifications',
  'course_lectures', 'exams', 'exam_questions', 'exam_attempts',
  'exam_attempt_questions', 'exam_answers', 'exam_integrity_events', 'certificates',
  'exam_certificates',
  'course_materials', 'system_wipe_requests'
];
const identityTables = new Set([
  'courses', 'levels', 'groups_table', 'users', 'students', 'enrollments',
  'course_sessions', 'attendance', 'payments', 'audit_logs', 'notifications',
  'course_settings', 'subjects', 'course_lectures', 'exams', 'exam_questions',
  'exam_attempts', 'exam_attempt_questions', 'exam_answers', 'exam_integrity_events',
  'certificates', 'exam_certificates', 'course_materials'
]);
const doctorUsernames = new Set(['rashad', 'elnashar', 'elalfy']);
const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;

export function findMatchingAdmin(users, actor) {
  return users.find(user => user?.role === 'admin' &&
    typeof user.username === 'string' &&
    user.username.toLowerCase() === actor.username.toLowerCase());
}

export function prepareBackupUsers(users, actor) {
  const restoredActor = findMatchingAdmin(users, actor);
  if (!restoredActor) {
    throw new DatabaseBackupError('النسخة لا تحتوي على حساب الإدارة المستخدم لبدء الاستعادة.');
  }
  const normalizedUsers = users.map(user =>
    user !== restoredActor && user && user.role === 'admin' &&
      typeof user.username === 'string' &&
      doctorUsernames.has(user.username.toLowerCase())
      ? { ...user, role: 'doctor' }
      : user);
  return { users: normalizedUsers, restoredActor };
}

export async function createDatabaseBackup(db) {
  const directory = await mkdtemp(join(tmpdir(), 'course-backup-'));
  const path = join(directory, 'course-backup.json');
  try {
    const data = {};
    for (const table of tables) {
      data[table] = (await db.query(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY 1`)).rows;
    }
    await writeFile(path, JSON.stringify({ format: 'course-postgres-backup', version: 1, data }), 'utf8');
    return { path, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreDatabaseBackup(db, buffer, actor) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new DatabaseBackupError('اختر ملف نسخة احتياطية صالحًا.');
  }

  let payload;
  try {
    payload = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new DatabaseBackupError('ملف النسخة غير صالح أو تالف.');
  }
  if (payload?.format !== 'course-postgres-backup' || payload.version !== 1 ||
      !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data) ||
      tables.some(table => ['certificates', 'exam_certificates', 'course_materials', 'system_wipe_requests'].includes(table)
        ? payload.data[table] !== undefined && !Array.isArray(payload.data[table])
        : !Array.isArray(payload.data[table])) ||
      Object.keys(payload.data).some(table => !tables.includes(table))) {
    throw new DatabaseBackupError('النسخة لا تطابق إصدار قاعدة بيانات هذا الموقع.');
  }
  payload.data.certificates ||= [];
  payload.data.exam_certificates ||= [];
  payload.data.course_materials ||= [];
  payload.data.system_wipe_requests ||= [];
  const preparedUsers = prepareBackupUsers(payload.data.users, actor);
  payload.data.users = preparedUsers.users;
  const { restoredActor } = preparedUsers;

  try {
    await transaction(db, async () => {
      const columnsByTable = new Map();
      for (const table of tables) {
        const { rows } = await db.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name=? ORDER BY ordinal_position`, [table]
        );
        columnsByTable.set(table, rows.map(row => row.column_name));
      }

      const allColumns = columnsByTable.get('users');
      if (!allColumns || !allColumns.includes('username')) {
        throw new DatabaseBackupError('مخطط قاعدة البيانات غير متوافق مع ملف النسخة.');
      }
      await db.query(`TRUNCATE TABLE ${tables.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);

      for (const table of tables) {
        const columns = columnsByTable.get(table);
        for (const row of payload.data[table]) {
          if (!row || typeof row !== 'object' || Array.isArray(row) ||
              Object.keys(row).some(column => !columns.includes(column))) {
            throw new DatabaseBackupError('النسخة تحتوي على أعمدة غير متوافقة.');
          }
          const names = Object.keys(row);
          if (!names.length) continue;
          const placeholders = names.map((_, index) => `$${index + 1}`).join(', ');
          await db.query(
            `INSERT INTO ${quoteIdentifier(table)} (${names.map(quoteIdentifier).join(', ')})
             VALUES (${placeholders})`,
            names.map(name => row[name])
          );
        }
      }

      for (const table of tables) {
        if (!identityTables.has(table)) continue;
        const sequence = await db.query(
          `SELECT pg_get_serial_sequence(?, 'id') AS sequence`, [`public.${table}`]
        );
        if (sequence.rows[0]?.sequence) {
          await db.query(
            `SELECT setval(pg_get_serial_sequence(?, 'id'),
              COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(table)}), 1),
              EXISTS(SELECT 1 FROM ${quoteIdentifier(table)}))`,
            [`public.${table}`]
          );
        }
      }
      await db.query('DELETE FROM auth_sessions');
      await audit(db, restoredActor, 'استعادة نسخة احتياطية', 'database', null,
        { restored_at: new Date().toISOString() });
    });
  } catch (error) {
    if (error instanceof DatabaseBackupError) throw error;
    console.error('PostgreSQL backup restore failed:', error);
    throw new DatabaseBackupError('فشل التحقق من النسخة أو استعادتها؛ لم يتم اعتماد أي تغيير.');
  }
}
