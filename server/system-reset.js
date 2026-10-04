import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { rateLimit } from 'express-rate-limit';
import { readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { passwordValid, transaction } from './db.js';

export const SYSTEM_DATA_LOCK_ID = 1414743888;
const BUCKET = 'stc-course-library';
const PRESERVED_TABLES = new Set(['neon_data_migrations', 'schema_migrations', 'system_wipe_requests', 'users']);
const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;

class SystemResetError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => { throw new SystemResetError(status, message); };
const timestamp = () => new Date().toISOString();
const staleProcessingBefore = () => new Date(Date.now() - 15 * 60 * 1000).toISOString();

async function recoverStaleRequest(db) {
  await db.query(`UPDATE system_wipe_requests SET status='failed',finished_at=?,
    failure_reason='توقف التنفيذ قبل اكتماله؛ أرسل طلبًا جديدًا بعد مراجعة الدكتور.'
    WHERE status='processing' AND approved_at<?`, [timestamp(), staleProcessingBefore()]);
}

export async function withSystemDataLock(db, callback) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SYSTEM_DATA_LOCK_ID]);
    const result = await callback();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to release the system-data transaction lock:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

function createStorageClient() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_ENDPOINT_URL_S3 || !AWS_REGION) {
    fail(503, 'تخزين المكتبة غير مهيأ؛ لم يبدأ مسح البيانات.');
  }
  return new S3Client({
    endpoint: AWS_ENDPOINT_URL_S3,
    region: AWS_REGION,
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    forcePathStyle: true
  });
}

async function emptyLibraryBucket(storage) {
  let continuationToken;
  do {
    const page = await storage.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      MaxKeys: 1000,
      ...(continuationToken ? { ContinuationToken: continuationToken } : {})
    }));
    const objects = (page.Contents || []).filter(object => object.Key).map(({ Key }) => ({ Key }));
    if (objects.length) {
      const deleted = await storage.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: objects, Quiet: false }
      }));
      if (deleted.Errors?.length) {
        throw new SystemResetError(503, 'تعذر حذف بعض ملفات المكتبة؛ لم يُستكمل مسح بيانات الموقع.');
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !continuationToken) {
      throw new SystemResetError(503, 'تعذر إكمال قراءة ملفات المكتبة؛ لم يُستكمل مسح بيانات الموقع.');
    }
  } while (continuationToken);
}

export async function removeAutomaticBackups({
  directory = resolve(process.cwd(), process.env.BACKUP_DIR || 'backups'),
  isVercel = process.env.VERCEL === '1'
} = {}) {
  if (isVercel) return;
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const backupNames = names.filter(name => /^course-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name));
  await Promise.all(backupNames.map(name => unlink(resolve(directory, name))));
}

async function truncateApplicationData(db) {
  const result = await db.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
  const tables = result.rows.map(row => row.table_name).filter(name => !PRESERVED_TABLES.has(name));
  if (tables.length) {
    await db.query(`TRUNCATE TABLE ${tables.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);
  }
  await db.query(`DELETE FROM users WHERE role='student'`);
}

export function registerSystemResetRoutes(app, db, {
  onComplete = () => {},
  createStorageClient: storageClientFactory = createStorageClient,
  removeBackups = removeAutomaticBackups
} = {}) {
  const passwordCheckLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'محاولات كثيرة لتأكيد كلمة المرور؛ حاول بعد 15 دقيقة' }
  });

  app.get('/api/system-reset/requests', async (req, res, next) => {
    if (!['admin', 'doctor', 'assistant'].includes(req.user.role)) return res.status(403).json({ error: 'هذا الإجراء لموظفي المركز فقط' });
    try {
      const rows = await withSystemDataLock(db, async () => {
        await recoverStaleRequest(db);
        return (await db.query(`SELECT id,requester_id,requester_name,requester_username,requester_role,
          approver_id,approver_name,approver_username,status,failure_reason,created_at,approved_at,finished_at
          FROM system_wipe_requests ORDER BY created_at DESC LIMIT 50`)).rows;
      });
      res.json({ requests: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/system-reset/requests', passwordCheckLimit, async (req, res, next) => {
    if (!['admin', 'doctor', 'assistant'].includes(req.user.role)) return res.status(403).json({ error: 'هذا الإجراء لموظفي المركز فقط' });
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => key !== 'password') ||
        typeof req.body.password !== 'string' || req.body.password.length < 12 || req.body.password.length > 128) {
      return res.status(400).json({ error: 'أدخل كلمة مرور صحيحة من 12 إلى 128 حرفًا' });
    }
    try {
      const user = (await db.query(`SELECT id,name,username,role,password_hash,active
        FROM users WHERE id=?`, [req.user.id])).rows[0];
      if (!user || !user.active || user.role !== req.user.role ||
          !passwordValid(req.body.password, user.password_hash)) {
        return res.status(401).json({ error: 'كلمة المرور غير صحيحة؛ لم يتم إرسال الطلب' });
      }
      const requestId = randomUUID();
      await withSystemDataLock(db, () => transaction(db, async () => {
        await recoverStaleRequest(db);
        const existing = (await db.query(`SELECT id FROM system_wipe_requests
          WHERE status IN ('pending','processing') LIMIT 1`)).rows[0];
        if (existing) fail(409, 'يوجد طلب مسح قائم بالفعل؛ راجعه قبل إرسال طلب آخر');
        await db.query(`INSERT INTO system_wipe_requests
          (id,requester_id,requester_name,requester_username,requester_role,status,created_at)
          VALUES(?,?,?,?,?,'pending',?)`,
        [requestId, user.id, user.name, user.username, user.role, timestamp()]);
      }));
      res.status(201).json({ id: requestId });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'يوجد طلب مسح قائم بالفعل؛ راجعه قبل إرسال طلب آخر' });
      next(error);
    }
  });

  app.post('/api/system-reset/requests/:id/cancel', async (req, res, next) => {
    if (!['admin', 'doctor', 'assistant'].includes(req.user.role)) return res.status(403).json({ error: 'هذا الإجراء لموظفي المركز فقط' });
    try {
      const result = await db.query(`UPDATE system_wipe_requests SET status='cancelled',finished_at=?
        WHERE id=? AND requester_id=? AND status='pending'`,
      [timestamp(), req.params.id, req.user.id]);
      if (!result.changes) return res.status(409).json({ error: 'لم يعد هذا الطلب قابلًا للإلغاء' });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/system-reset/requests/:id/approve', async (req, res, next) => {
    if (!['admin', 'doctor'].includes(req.user.role)) return res.status(403).json({ error: 'موافقة المسح متاحة للدكاترة فقط' });
    try {
      const request = await withSystemDataLock(db, async () => {
        const approvedAt = timestamp();
        const result = await transaction(db, async () => {
          const pending = (await db.query(`SELECT * FROM system_wipe_requests
            WHERE id=? AND status='pending' FOR UPDATE`, [req.params.id])).rows[0];
          if (!pending) fail(409, 'الطلب غير موجود أو تمت معالجته بالفعل');
          if (pending.requester_id === req.user.id) fail(403, 'لا يمكن للدكتور الموافقة على طلب المسح الذي أرسله بنفسه');
          const approver = (await db.query(`SELECT id,name,username,role,active FROM users WHERE id=?`, [req.user.id])).rows[0];
          if (!approver || !['admin', 'doctor'].includes(approver.role) || !approver.active) fail(403, 'يجب أن تكون الموافقة من حساب دكتور نشط');
          await db.query(`UPDATE system_wipe_requests SET status='processing',approver_id=?,
            approver_name=?,approver_username=?,approved_at=? WHERE id=?`,
          [approver.id, approver.name, approver.username, approvedAt, pending.id]);
          return pending;
        });

        let storage;
        try {
          storage = storageClientFactory();
          await emptyLibraryBucket(storage);
        } catch (error) {
          console.error('System data wipe failed while removing course-library objects:', error);
          if (error.status === 503) throw error;
          throw new SystemResetError(503, 'تعذر حذف ملفات مكتبة المحاضرات؛ تحقق من اتصال Neon وصلاحيات التخزين.');
        } finally {
          storage?.destroy();
        }
        try {
          await removeBackups();
        } catch (error) {
          console.error('System data wipe failed while removing automatic backups:', error);
          throw new SystemResetError(503, 'تعذر تنظيف النسخ الاحتياطية؛ قاعدة البيانات لم تُمسح.');
        }
        try {
          await transaction(db, async () => {
            await truncateApplicationData(db);
            await db.query(`UPDATE system_wipe_requests SET status='completed',finished_at=?,failure_reason=''
              WHERE id=? AND status='processing'`, [timestamp(), result.id]);
          });
        } catch (error) {
          console.error('System data wipe failed while clearing application tables:', error);
          throw new SystemResetError(503, 'تعذر مسح قاعدة البيانات؛ لم يتم اعتماد أي تغيير على جداولها.');
        }
        return result;
      });
      onComplete();
      res.json({ ok: true, requester_name: request.requester_name, approver_name: req.user.name });
    } catch (error) {
      const failureReason = error.status === 503
        ? error.message
        : 'حدث خطأ داخلي أثناء المسح؛ راجع سجل الخادم قبل إعادة المحاولة.';
      try {
        await db.query(`UPDATE system_wipe_requests SET status='failed',finished_at=?,failure_reason=?
          WHERE id=? AND status='processing'`,
        [timestamp(), failureReason, req.params.id]);
      } catch (statusError) {
        console.error('Failed to record the system-wipe failure:', statusError);
      }
      next(error);
    }
  });
}
