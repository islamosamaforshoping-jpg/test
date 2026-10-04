import { createApp } from './app.js';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { openDatabase } from './db.js';
import { startSessionReminderWorker } from './session-reminders.js';
import { createDatabaseBackup } from './database-backup.js';
import { SYSTEM_DATA_LOCK_ID } from './system-reset.js';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
const port = Number(process.env.PORT || 3000);
const db = openDatabase();
const localDevelopment = process.env.LOCAL_DEV === '1';
const stopSessionReminderWorker = localDevelopment ? () => {} : await startSessionReminderWorker(db);
const backupDirectory = resolve(process.env.BACKUP_DIR || 'backups');
let lastAutomaticBackupDate = '';
const runAutomaticBackup = async () => {
  const lockClient = await db.pool.connect();
  try {
    await lockClient.query('BEGIN');
    try {
      const lock = await lockClient.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [SYSTEM_DATA_LOCK_ID]);
      if (!lock.rows[0].locked) {
        await lockClient.query('ROLLBACK');
        return;
      }
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (day !== lastAutomaticBackupDate) {
        const changed = await (await db.query(
          `SELECT 1 FROM audit_logs WHERE ((created_at::timestamptz) AT TIME ZONE 'Africa/Cairo')::date=? LIMIT 1`, [day]
        )).rows[0];
        if (changed) {
          await mkdir(backupDirectory, { recursive: true });
          const filename = `course-backup-${day}.json`;
          const existing = await readdir(backupDirectory).catch(() => []);
          if (existing.includes(filename)) lastAutomaticBackupDate = day;
          else {
            const snapshot = await createDatabaseBackup(db);
            try { await copyFile(snapshot.path, resolve(backupDirectory, filename)); lastAutomaticBackupDate = day; }
            finally { await snapshot.cleanup(); }
          }
        }
      }
      await lockClient.query('COMMIT');
    } catch (error) {
      await lockClient.query('ROLLBACK');
      throw error;
    }
  } finally {
    lockClient.release();
  }
};
const automaticBackupTimer = localDevelopment
  ? null
  : setInterval(() => runAutomaticBackup().catch(error => console.error('Automatic daily backup failed:', error)), 15 * 60 * 1000);
if (!localDevelopment) await runAutomaticBackup().catch(error => console.error('Automatic daily backup failed:', error));
const server = createApp({ db }).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Course Management: http://localhost:${port}`));
const shutdown = () => server.close(async () => {
	if (automaticBackupTimer) clearInterval(automaticBackupTimer);
	stopSessionReminderWorker();
	await db.close();
	process.exit(0);
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);