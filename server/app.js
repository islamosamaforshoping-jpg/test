import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import QRCode from 'qrcode';
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import { openDatabase, transaction, audit, token, digest, passwordHash, passwordValid, today } from './db.js';
import { formatClockTime, sessionStartsAtUtc } from './session-reminders.js';
import { registerAcademicRoutes } from './academic.js';
import { registerSystemResetRoutes, withSystemDataLock } from './system-reset.js';
import { registerAiAssistantRoutes } from './ai-assistant.js';
import { createDatabaseBackup, DatabaseBackupError, restoreDatabaseBackup } from './database-backup.js';
import { dailyOperationsReport } from './daily-report.js';
import { paymentReceiptHtml } from './receipt.js';
import { renderPdf } from './pdf.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const integer = (value, name = 'المعرّف') => {
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) fail(400, `${name} غير صحيح`); return n;
};
const text = (value, name, min = 1, max = 120) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${name} غير صحيح`);
  return value.trim();
};
const money = value => {
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) fail(400, 'أدخل مبلغًا صحيحًا بحد أقصى منزلتين عشريتين');
  const [whole, fraction = ''] = value.split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'التاريخ غير صحيح');
  return value;
};
const dateTime = (value, name) => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(400, `${name} غير صحيح`);
  return new Date(value).toISOString();
};
const clockTime = (value, name) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(400, `${name} غير صحيح`);
  return value;
};
const bool = value => {
  if (typeof value === 'boolean') return Number(value);
  if (typeof value === 'number' && (value === 0 || value === 1)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(normalized)) return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on' ? 1 : 0;
  }
  fail(400, 'القيمة يجب أن تكون نعم أو لا');
};
const fields = (body, allowed) => {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !allowed.includes(k))) fail(400, 'حقول الطلب غير مسموح بها');
};
const password = value => {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail(400, 'كلمة المرور يجب أن تكون من 12 إلى 128 حرفًا'); return value;
};
const username = value => {
  const name = text(value, 'اسم الدخول', 3, 60);
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) fail(400, 'اسم الدخول: حروف إنجليزية وأرقام و . _ - فقط'); return name;
};
const studentCode = value => {
  const code = text(value, 'كود الطالب', 1, 32);
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) fail(400, 'الكود: أرقام إنجليزية أو حروف أو - أو _'); return code;
};
const safeUser = user => ({ id: user.id, name: user.name, username: user.username, role: user.role, can_set_price: Boolean(user.can_set_price) });
const DEFAULT_ABSENCE_THRESHOLD = 25;
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const certificateStyles = `
  *{box-sizing:border-box}
  body{margin:0;padding:28px;background:#080808;color:#f3eddd;font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif}
  .certificate{position:relative;isolation:isolate;display:flex;min-height:740px;max-width:1120px;margin:0 auto;padding:20px;overflow:hidden;border-radius:22px;background:#050505;text-align:center;box-shadow:0 28px 80px rgba(0,0,0,.55)}
  .certificate::before{position:absolute;z-index:-1;inset:7px;border:1px solid #d5b65d;border-radius:16px;content:""}
  .certificate::after{position:absolute;z-index:-1;inset:13px;border:1px solid rgba(225,198,127,.38);border-radius:11px;content:""}
  .certificate-inner{position:relative;display:flex;width:100%;flex:1;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;border-radius:9px;padding:34px 64px;background:#171614;text-align:center}
  .certificate-inner::before{position:absolute;z-index:-1;top:43%;left:50%;color:rgba(218,182,89,.055);content:"S.T.C";font-family:Georgia,serif;font-size:190px;font-weight:700;letter-spacing:12px;transform:translate(-50%,-50%);direction:ltr}
  .certificate-header{display:flex;width:100%;align-items:center;gap:16px;padding:13px 17px;border-bottom:1px solid #806529;border-radius:14px;background:#0d0d0c;color:#fff;text-align:right}
  .brand-mark{display:grid;width:54px;height:54px;flex:none;place-items:center;border:1px solid #d3b36a;border-radius:50%;color:#e0c47d;font-family:Georgia,serif;font-size:16px;font-weight:700;letter-spacing:1px}
  .brand-copy{display:flex;flex:1;flex-direction:column;gap:2px}
  .brand-copy strong{color:#f7f0dd;font-size:18px}
  .brand-copy span{color:#cbb579;font-family:Georgia,serif;font-size:10px;letter-spacing:2px;direction:ltr;text-align:right}
  .certificate-kind{padding:7px 13px;border:1px solid #c6a85f;border-radius:999px;color:#e2cb8e;font-size:12px;font-weight:600}
  .ornament{display:flex;width:100%;align-items:center;gap:12px;margin:21px 0 5px;color:#b08c43}
  .ornament::before,.ornament::after{height:1px;flex:1;background:linear-gradient(90deg,transparent,#bd9b53)}
  .ornament::after{transform:rotate(180deg)}
  .ornament span{width:10px;height:10px;border:1px solid #bd9b53;border-radius:50%;background:#171614}
  .eyebrow{margin:8px 0;color:#9a7732;font-size:14px;font-weight:700;letter-spacing:.4px}
  .certificate h1{max-width:760px;margin:0;color:#f1e6c7;font-size:38px;line-height:1.5}
  .presented{margin:20px 0 0;color:#b8b1a2;font-size:15px}
  .student-name{margin:2px 0 8px;color:#fffaf0;font-size:37px;font-weight:700}
  .student-underline{width:210px;height:2px;margin:0 0 15px;background:linear-gradient(90deg,transparent,#b18c43,#e0cb92,#b18c43,transparent)}
  .description{max-width:760px;margin:4px auto;color:#d0cabd;font-size:18px;line-height:1.9}
  .detail-line{margin:8px 0 0;color:#b4aa91;font-size:14px}
  .score-panel{display:flex;min-width:390px;align-items:center;justify-content:center;gap:30px;margin:18px 0 0;padding:14px 30px;border:1px solid #e0c477;border-radius:18px;background:linear-gradient(125deg,#d8bd79,#b58c3e);color:#17130a}
  .score-item{display:flex;flex-direction:column;gap:2px}
  .score-item span{color:#59451b;font-size:12px}
  .score-item strong{color:#17130a;font-size:25px}
  .score-divider{width:1px;height:42px;background:rgba(59,43,12,.45)}
  .certificate-footer{display:flex;width:100%;align-items:end;justify-content:space-between;margin-top:30px;padding-top:20px}
  .sign-block{display:flex;min-width:190px;flex-direction:column;gap:5px;text-align:center}
  .sign-block span{color:#c8b77f;font-size:12px}
  .sign-block strong{padding-top:7px;border-top:1px solid #a88a4c;color:#f4edda;font-size:15px;font-weight:600}
  .seal{position:relative;display:flex;width:88px;height:88px;flex:none;flex-direction:column;align-items:center;justify-content:center;gap:1px;transform:rotate(-7deg);border:2px solid #d1ad59;border-radius:50%;background:radial-gradient(circle,#d4b66212 0 48%,transparent 50%);box-shadow:0 0 0 3px #171614,0 0 0 4px #b99549;color:#e0c375}
  .seal::before{position:absolute;inset:5px;border:1px solid #bd9b53;border-radius:50%;content:""}
  .seal::after{position:absolute;top:-5px;left:50%;width:7px;height:7px;transform:translateX(-50%) rotate(45deg);border:1px solid #d9bb70;background:#171614;content:""}
  .seal .seal-top,.seal .seal-bottom,.seal .seal-star{z-index:1;color:#d5b965;font-size:8px;font-weight:600}
  .seal strong{z-index:1;font-family:Georgia,serif;font-size:17px;letter-spacing:1px}
  .certificate-number{margin:16px 0 0;color:#aa9b75;font-family:Georgia,serif;font-size:11px;letter-spacing:.8px;direction:ltr}
  .print-button{display:block;margin:20px auto;padding:12px 22px;border:1px solid #bd9b53;border-radius:999px;background:#171615;color:#f7e7b6;font:inherit;font-weight:700;cursor:pointer}
  @page{size:A4 landscape;margin:8mm}
  @media print{body{padding:0;background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}.certificate{width:100%;max-width:none;min-height:190mm;box-shadow:none}.print-button{display:none}}
  @media(max-width:700px){body{padding:10px}.certificate{min-height:700px;padding:12px}.certificate-inner{padding:30px 20px}.certificate-header{gap:10px;padding:10px}.brand-mark{width:46px;height:46px;font-size:14px}.brand-copy strong{font-size:14px}.certificate-kind{padding:6px 8px;font-size:10px}.certificate h1{font-size:29px}.student-name{font-size:29px}.description{font-size:16px}.score-panel{min-width:0;width:100%;gap:20px;padding:12px}.score-item strong{font-size:20px}.certificate-footer{gap:12px}.sign-block{min-width:0;flex:1}.seal{width:70px;height:70px}.seal .seal-top,.seal .seal-bottom,.seal .seal-star{font-size:6px}.seal strong{font-size:13px}.certificate-inner::before{font-size:130px}}
`;
function sendCertificateDocument(res, { pageTitle, eyebrow, title, studentName, description, detail,
  score, percentage, issuerName, issueDate, certificateNumber }) {
  const scorePanel = score === undefined ? '' : `<div class="score-panel"><div class="score-item"><span>الدرجة</span><strong>${htmlEscape(score)}</strong></div><div class="score-divider"></div><div class="score-item"><span>النسبة</span><strong>${htmlEscape(percentage)}٪</strong></div></div>`;
  res.type('html').send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>${htmlEscape(pageTitle)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>${certificateStyles}</style></head><body><main class="certificate"><div class="certificate-inner">
    <header class="certificate-header"><div class="brand-mark">S.T.C</div><div class="brand-copy">
    <strong>مركز السويس للتدريب</strong><span>SUEZ TRAINING CENTER</span></div>
    <span class="certificate-kind">شهادة رسمية</span></header>
    <div class="ornament"><span></span></div><p class="eyebrow">${htmlEscape(eyebrow)}</p>
    <h1>${htmlEscape(title)}</h1><p class="presented">تُمنح بكل فخر إلى</p>
    <p class="student-name">${htmlEscape(studentName)}</p><div class="student-underline"></div>
    <p class="description">${description}</p>${detail ? `<p class="detail-line">${detail}</p>` : ''}
    ${scorePanel}<footer class="certificate-footer">
    <div class="sign-block"><span>اعتماد وإصدار</span><strong>${htmlEscape(issuerName)}</strong></div>
    <div class="seal" aria-label="ختم مركز السويس للتدريب"><span class="seal-top">مركز السويس</span><strong>S.T.C</strong><span class="seal-bottom">اعتماد رسمي</span><span class="seal-star">✦</span></div>
    <div class="sign-block"><span>تاريخ الإصدار</span><strong>${htmlEscape(issueDate)}</strong></div>
    </footer><p class="certificate-number">CERTIFICATE NO. ${htmlEscape(certificateNumber)}</p>
    </div></main><button class="print-button" id="print-certificate" type="button">طباعة الشهادة أو حفظها PDF</button>
    <script src="/certificate-print.js" defer></script></body></html>`);
}

export function createApp({ db = openDatabase(), secureCookies = process.env.NODE_ENV === 'production' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    upgradeInsecureRequests: secureCookies ? [] : null
  } }, strictTransportSecurity: secureCookies }));
  app.use(express.json({ limit: '24kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'طلبات كثيرة؛ حاول بعد دقيقة' } }));
  const dummyHash = passwordHash(token());
  const loginLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'محاولات كثيرة. حاول بعد 15 دقيقة' } });
  const cookie = (res, value, maxAge) => res.cookie('course_session', value, { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/', maxAge });
  const staff = (req, res, next) => { if (!['admin', 'doctor', 'assistant'].includes(req.user.role)) fail(403, 'غير مسموح لك بهذه العملية'); next(); };
  const admin = (req, res, next) => { if (req.user.role !== 'admin') fail(403, 'هذه العملية للإدارة فقط'); next(); };
  const operator = (req, res, next) => { if (req.user.role !== 'assistant') fail(403, 'هذه العملية التشغيلية متاحة لدنيا فقط'); next(); };
  const doctorOrAdmin = (req, res, next) => { if (!['doctor', 'admin'].includes(req.user.role)) fail(403, 'هذه العملية متاحة للدكاترة فقط'); next(); };
  let settingsCache;
  const courseSettings = async () => settingsCache || (settingsCache =
    (await db.query('SELECT * FROM course_settings WHERE id=1', [])).rows[0] ||
    { id: 1, booking_open: 1, booking_starts_at: null, booking_ends_at: null, course_starts_at: null });
  const courseStarted = async () => {
    const start = await (await courseSettings())?.course_starts_at;
    return Boolean(start && Date.parse(start) <= Date.now());
  };
  const coursePhase = async () => {
    const settings = await courseSettings(), now = Date.now();
    const withinStart = !settings.booking_starts_at || Date.parse(settings.booking_starts_at) <= now;
    const beforeEnd = !settings.booking_ends_at || Date.parse(settings.booking_ends_at) > now;
    const bookingOpen = Boolean(settings.booking_open && withinStart && beforeEnd && !await courseStarted());
    return { phase: await courseStarted() ? 'lectures' : 'booking', booking_open: bookingOpen,
      course_started: await courseStarted(), booking_starts_at: settings.booking_starts_at,
      booking_ends_at: settings.booking_ends_at, course_starts_at: settings.course_starts_at };
  };
  const ensureBookingOpen = async () => { if (!await (await coursePhase()).booking_open) fail(409, 'الحجز مغلق حاليًا'); };
  const studentRow = async id => {
    const row = await (await db.query(`SELECT s.*,l.name level_name,g.name group_name,u.username FROM students s
      JOIN levels l ON l.id=s.level_id JOIN groups_table g ON g.id=s.group_id JOIN users u ON u.id=s.user_id WHERE s.id=?`, [id])).rows[0];
    if (!row) fail(404, 'الطالب غير موجود'); return row;
  };
  const owned = async (req, id) => {
    const row = await studentRow(id);
    if (req.user.role === 'student' && row.user_id !== req.user.id) fail(403, 'لا يمكنك مشاهدة بيانات طالب آخر');
    return row;
  };
  const history = async (studentId, cutoff = today()) => await (await db.query(`
    SELECT cs.id session_id,cs.date,cs.title,g.name group_name,l.name level_name,
      a.id attendance_id,a.created_at, u.name recorded_by,
      CASE WHEN a.id IS NULL THEN 'غائب' ELSE 'حاضر' END status
    FROM course_sessions cs JOIN groups_table g ON g.id=cs.group_id JOIN levels l ON l.id=g.level_id
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=? LEFT JOIN users u ON u.id=a.recorded_by
    WHERE cs.cancelled=0 AND cs.date<=? AND EXISTS(
      SELECT 1 FROM enrollments e WHERE e.student_id=? AND e.group_id=cs.group_id
      AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)) ORDER BY cs.date DESC
  `, [studentId, cutoff, studentId])).rows;
  const paidAmount = async id => await (await db.query('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE student_id=? AND voided_at IS NULL', [id])).rows[0].total;
  const summarize = async row => {
    const snapshot = row.course_price_snapshot ?? row.price, cancelled = Boolean(row.cancelled_at);
    const h = await courseStarted() ? await history(row.id) : [], present = h.filter(x => x.attendance_id).length;
    const paid = await paidAmount(row.id);
    const { qr_token, ...safe } = row;
    return { ...safe, price: snapshot, course_price_snapshot: snapshot, paid, remaining: Math.max(0, snapshot - paid),
      booking_status: cancelled ? 'cancelled' : paid === 0 ? 'unpaid' : paid < snapshot ? 'partial' : 'confirmed',
      present, absent: h.length - present, total_sessions: h.length, percentage: h.length ? Math.round(present / h.length * 100) : 0 };
  };
  const detail = async row => ({ ...await summarize(row), payments: await (await db.query(`
    SELECT p.*,u.name recorded_by_name,v.name voided_by_name FROM payments p JOIN users u ON u.id=p.recorded_by
    LEFT JOIN users v ON v.id=p.voided_by WHERE p.student_id=? ORDER BY p.created_at DESC,p.id DESC`, [row.id])).rows, attendance: await courseStarted() ? await history(row.id) : [] });
  const groupCheck = async (levelId, groupId) => { if (!await (await db.query('SELECT id FROM groups_table WHERE id=? AND level_id=?', [groupId, levelId])).rows[0]) fail(400, 'المجموعة لا تتبع الفرقة المحددة'); };

  app.post('/api/login', loginLimit, async (req, res) => {
    fields(req.body, ['username', 'password', 'remember']);
    const name = text(req.body.username, 'اسم الدخول', 1, 60);
    const pass = text(req.body.password, 'كلمة المرور', 1, 128);
    const user = await (await db.query('SELECT * FROM users WHERE username=?', [name])).rows[0];
    const valid = passwordValid(pass, user?.password_hash || dummyHash);
    if (!valid || !user?.active) fail(401, 'اسم الدخول أو كلمة المرور غير صحيحة، أو الحساب معطّل');
    const raw = token(), csrf = token();
    await transaction(db, async () => {
      await db.query('DELETE FROM auth_sessions WHERE expires_at<?', [Date.now()]);
      const maxAge = req.body.remember === true ? 30 * 24 * 3600000 : 8 * 3600000;
      await db.query('INSERT INTO auth_sessions VALUES(?,?,?,?)', [digest(raw), user.id, csrf, Date.now() + maxAge]);
      await audit(db, user, 'تسجيل دخول', 'user', user.id);
    });
    cookie(res, raw, req.body.remember === true ? 30 * 24 * 3600000 : 8 * 3600000); res.json({ user: safeUser(user), csrf });
  });
  app.use('/api', async (req, res, next) => {
    const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('course_session='))?.slice(15);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) fail(401, 'يرجى تسجيل الدخول');
    const session = await (await db.query(`SELECT a.csrf,a.token_hash,u.* FROM auth_sessions a JOIN users u ON u.id=a.user_id
      WHERE a.token_hash=? AND a.expires_at>? AND u.active=1`, [digest(raw), Date.now()])).rows[0];
    if (!session) fail(401, 'انتهت الجلسة أو تم تعطيل الحساب؛ سجّل الدخول');
    req.user = session;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-csrf-token'] !== session.csrf) fail(403, 'تعذر التحقق من أمان الطلب. أعد تحميل الصفحة');
    const resetInProgress = (await db.query(`SELECT 1 FROM system_wipe_requests
      WHERE status='processing' LIMIT 1`)).rows[0];
    if (resetInProgress && !(req.method === 'GET' && req.path === '/system-reset/requests')) {
      return res.status(423).json({ error: 'مسح البيانات قيد التنفيذ؛ انتظر قليلًا ثم حدّث الصفحة' });
    }
    next();
  });
  app.get('/api/me', (req, res) => res.json({ user: safeUser(req.user), csrf: req.user.csrf, today: today() }));
  app.get('/api/backup', admin, async (req, res, next) => {
    let snapshot;
    try {
      await withSystemDataLock(db, async () => {
        snapshot = await createDatabaseBackup(db);
        res.set('Content-Type', 'application/vnd.course-backup+json');
        await new Promise((resolveDownload, rejectDownload) => {
          res.download(snapshot.path, `course-backup-${today()}.json`, error => {
            if (error) rejectDownload(error);
            else resolveDownload();
          });
        });
      });
    } catch (error) {
      if (!res.headersSent) next(error);
    } finally {
      await snapshot?.cleanup();
    }
  });
  app.post('/api/backup/restore', admin, express.raw({ type: 'application/vnd.course-backup+json', limit: '100mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) fail(400, 'أرسل ملف نسخة احتياطية بصيغة JSON.');
    try { await withSystemDataLock(db, () => restoreDatabaseBackup(db, req.body, req.user)); }
    catch (error) { if (error instanceof DatabaseBackupError) fail(error.status, error.message); throw error; }
    settingsCache = undefined;
    cookie(res, '', 0);
    res.json({ ok: true });
  });
  app.post('/api/logout', async (req, res) => {
    await db.query('DELETE FROM auth_sessions WHERE token_hash=?', [req.user.token_hash]); cookie(res, '', 0); res.json({ ok: true });
  });
  app.post('/api/password', async (req, res) => {
    if (['admin', 'doctor'].includes(req.user.role)) fail(403, 'حسابات الدكاترة للعرض فقط');
    fields(req.body, ['current_password', 'password']);
    if (!passwordValid(text(req.body.current_password, 'كلمة المرور', 1, 128), req.user.password_hash)) fail(400, 'كلمة المرور الحالية غير صحيحة');
    const hash = passwordHash(password(req.body.password));
    await transaction(db, async () => {
      await db.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.user.id]);
      await db.query('DELETE FROM auth_sessions WHERE user_id=?', [req.user.id]);
      await audit(db, req.user, 'تغيير كلمة المرور', 'user', req.user.id);
    }); cookie(res, '', 0); res.json({ ok: true });
  });
  app.get('/api/meta', async (req, res) => res.json({ levels: await (await db.query('SELECT * FROM levels', [])).rows, groups: await (await db.query('SELECT * FROM groups_table', [])).rows,
    course: (await (await db.query('SELECT * FROM courses WHERE id=1', [])).rows[0]) || { id: 1, name: '', price: 0 }, course_prices: await (await db.query(`SELECT lcp.level_id,lcp.price,lcp.updated_at,l.name level_name
      FROM level_course_prices lcp JOIN levels l ON l.id=lcp.level_id ORDER BY l.id`, [])).rows,
    course_settings: await courseSettings(), phase: await coursePhase(), today: today() }));
  app.get('/api/course/prices', staff, async (req, res) => res.json(await (await db.query(`SELECT lcp.level_id,lcp.price,lcp.updated_at,l.name level_name
    FROM level_course_prices lcp JOIN levels l ON l.id=lcp.level_id ORDER BY l.id`, [])).rows));
  app.patch('/api/course/prices/:levelId', operator, async (req, res) => {
    fields(req.body, ['price']); const levelId = integer(req.params.levelId), price = money(req.body.price);
    if (!await (await db.query('SELECT id FROM levels WHERE id=?', [levelId])).rows[0]) fail(404, 'الفرقة غير موجودة');
    await transaction(db, async () => {
      const before = await (await db.query('SELECT price FROM level_course_prices WHERE level_id=?', [levelId])).rows[0]?.price ?? 0;
      await db.query(`INSERT INTO level_course_prices(level_id,price,updated_by,updated_at) VALUES(?,?,?,to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        ON CONFLICT(level_id) DO UPDATE SET price=excluded.price,updated_by=excluded.updated_by,updated_at=excluded.updated_at`, [levelId, price, req.user.id]);
      await audit(db, req.user, 'تعديل سعر الفرقة', 'level', levelId, { before, after: price });
    });
    res.json(await (await db.query('SELECT level_id,price,updated_at FROM level_course_prices WHERE level_id=?', [levelId])).rows[0]);
  });
  app.get('/api/course/settings', staff, async (req, res) => res.json(await coursePhase()));
  app.patch('/api/course/settings', operator, async (req, res) => {
    fields(req.body, ['booking_open', 'booking_starts_at', 'booking_ends_at', 'course_starts_at']);
    const current = await courseSettings(), bookingOpen = req.body.booking_open === undefined ? current.booking_open : bool(req.body.booking_open);
    const starts = req.body.booking_starts_at === undefined ? current.booking_starts_at : dateTime(req.body.booking_starts_at, 'بداية الحجز');
    const ends = req.body.booking_ends_at === undefined ? current.booking_ends_at : dateTime(req.body.booking_ends_at, 'نهاية الحجز');
    const courseStarts = req.body.course_starts_at === undefined ? current.course_starts_at : dateTime(req.body.course_starts_at, 'بداية الكورس');
    if (starts && ends && Date.parse(ends) <= Date.parse(starts)) fail(400, 'نهاية الحجز يجب أن تكون بعد بدايته');
    await transaction(db, async () => {
      await db.query(`INSERT INTO course_settings(id,booking_open,booking_starts_at,booking_ends_at,course_starts_at,updated_by,updated_at)
        VALUES(1,?,?,?,?,?,to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        ON CONFLICT(id) DO UPDATE SET booking_open=excluded.booking_open,booking_starts_at=excluded.booking_starts_at,
        booking_ends_at=excluded.booking_ends_at,course_starts_at=excluded.course_starts_at,updated_by=excluded.updated_by,
        updated_at=excluded.updated_at`, [bookingOpen, starts, ends, courseStarts, req.user.id]);
      settingsCache = await (await db.query('SELECT * FROM course_settings WHERE id=1', [])).rows[0];
      await audit(db, req.user, 'تعديل مواعيد الحجز وبداية الكورس', 'course', 1,
        { booking_open: bookingOpen, booking_starts_at: starts, booking_ends_at: ends, course_starts_at: courseStarts });
    });
    res.json(await coursePhase());
  });
  app.get('/api/student/me', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'هذه الصفحة للطلاب');
    const s = await (await db.query('SELECT id FROM students WHERE user_id=?', [req.user.id])).rows[0];
    if (!s) fail(404, 'ملف الطالب غير موجود'); res.json(await detail(await studentRow(s.id)));
  });
  const currentStudent = async userId => {
    const student = await (await db.query('SELECT id FROM students WHERE user_id=?', [userId])).rows[0];
    if (!student) fail(404, 'ملف الطالب غير موجود');
    return student;
  };
  app.get('/api/notifications', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'صندوق الإشعارات متاح للطالب فقط');
    const student = await currentStudent(req.user.id);
    const items = await (await db.query(`SELECT id,title,message,type,is_read,created_at,read_at
      FROM notifications WHERE student_id=? ORDER BY id DESC`, [student.id])).rows;
    res.json({ items, unread_count: items.filter(item => !item.is_read).length });
  });
  app.patch('/api/notifications/:id/read', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'قراءة الإشعار متاحة للطالب فقط');
    fields(req.body, []);
    const student = await currentStudent(req.user.id), id = integer(req.params.id);
    const notification = await transaction(db, async () => {
      const existing = await (await db.query('SELECT id,is_read FROM notifications WHERE id=? AND student_id=?', [id, student.id])).rows[0];
      if (!existing) fail(404, 'الإشعار غير موجود');
      if (!existing.is_read) await db.query(`UPDATE notifications SET is_read=1,read_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        WHERE id=? AND student_id=? AND is_read=0`, [id, student.id]);
      return await (await db.query(`SELECT id,title,message,type,is_read,created_at,read_at FROM notifications WHERE id=? AND student_id=?`, [id, student.id])).rows[0];
    });
    res.json(notification);
  });
  app.post('/api/notifications/read-all', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'قراءة الإشعارات متاحة للطالب فقط');
    fields(req.body, []);
    const student = await currentStudent(req.user.id);
    const result = await db.query(`UPDATE notifications SET is_read=1,read_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      WHERE student_id=? AND is_read=0`, [student.id]);
    res.json({ updated: result.changes });
  });
  app.post('/api/students/:id/certificate', doctorOrAdmin, async (req, res) => {
    fields(req.body, []);
    const studentId = integer(req.params.id, 'الطالب');
    const result = await transaction(db, async () => {
      const student = await studentRow(studentId);
      const existing = await (await db.query('SELECT * FROM certificates WHERE student_id=?', [student.id])).rows[0];
      let certificate = existing, resent = Boolean(existing);
      if (!certificate) {
        const course = await (await db.query('SELECT name FROM courses WHERE id=1', [])).rows[0];
        if (!course) fail(409, 'اسم الكورس غير مضبوط');
        const year = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric' }).format(new Date());
        const certificateNumber = `STC-${year}-${token().slice(0, 12).toUpperCase()}`;
        const id = Number(await (await db.query(`INSERT INTO certificates
          (student_id,certificate_number,student_name,course_name,level_name,group_name,issuer_name,issued_at,issued_by)
          VALUES(?,?,?,?,?,?,?,?,?)`, [
          student.id, certificateNumber, student.name, course.name, student.level_name, student.group_name,
          req.user.name, new Date().toISOString(), req.user.id
        ])).lastInsertRowid);
        certificate = await (await db.query('SELECT * FROM certificates WHERE id=?', [id])).rows[0];
      }
      const action = resent ? 'إعادة إرسال شهادة طالب' : 'إصدار شهادة لطالب';
      const notificationId = Number(await (await db.query(`INSERT INTO notifications
        (student_id,title,message,type,created_by,metadata) VALUES(?,?,?,'GENERAL',?,?)`, [
        student.id, 'شهادة إتمام الكورس', 'أرسل لك الدكتور شهادة إتمام الكورس. يمكنك عرضها وتحميلها من ملفك الدراسي.',
        req.user.id, JSON.stringify({ certificate_id: certificate.id, certificate_number: certificate.certificate_number })
      ])).lastInsertRowid);
      await audit(db, req.user, action, 'certificate', certificate.id, {
        student_id: student.id, student_name: student.name, certificate_number: certificate.certificate_number,
        notification_id: notificationId
      });
      return { certificate, resent };
    });
    res.status(result.resent ? 200 : 201).json({
      id: result.certificate.id, certificate_number: result.certificate.certificate_number, resent: result.resent
    });
  });
  app.get('/api/student/certificates', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'الشهادات متاحة للطالب فقط');
    const student = await currentStudent(req.user.id);
    const certificates = await (await db.query(`SELECT id,certificate_number,course_name,level_name,group_name,issuer_name,issued_at
      FROM certificates WHERE student_id=? ORDER BY issued_at DESC,id DESC`, [student.id])).rows;
    const examCertificates = await (await db.query(`SELECT id,certificate_number,exam_title,subject_name,lecture_title,
      score,percentage,total_questions,issuer_name,issued_at
      FROM exam_certificates WHERE student_id=? ORDER BY issued_at DESC,id DESC`, [student.id])).rows;
    res.json({ items: certificates, exam_items: examCertificates });
  });
  app.get('/api/student/certificates/:id/print', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'عرض الشهادة متاح للطالب فقط');
    const student = await currentStudent(req.user.id), id = integer(req.params.id, 'الشهادة');
    const certificate = await (await db.query('SELECT * FROM certificates WHERE id=? AND student_id=?', [id, student.id])).rows[0];
    if (!certificate) fail(404, 'الشهادة غير موجودة');
    const issueDate = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long', timeZone: 'Africa/Cairo' })
      .format(new Date(certificate.issued_at));
    sendCertificateDocument(res, {
      pageTitle: `شهادة إتمام - ${certificate.student_name}`,
      eyebrow: 'شهادة إتمام الكورس',
      title: certificate.course_name,
      studentName: certificate.student_name,
      description: 'تقديرًا لإتمام الكورس بنجاح، مع أطيب التمنيات بمزيد من النجاح والتوفيق.',
      detail: `${htmlEscape(certificate.level_name)} · ${htmlEscape(certificate.group_name)}`,
      issuerName: certificate.issuer_name,
      issueDate,
      certificateNumber: certificate.certificate_number
    });
  });
  app.get('/api/student/exam-certificates/:id/print', async (req, res) => {
    if (req.user.role !== 'student') fail(403, 'عرض الشهادة متاح للطالب فقط');
    const student = await currentStudent(req.user.id), id = integer(req.params.id, 'الشهادة');
    const certificate = await (await db.query(
      'SELECT * FROM exam_certificates WHERE id=? AND student_id=?', [id, student.id]
    )).rows[0];
    if (!certificate) fail(404, 'شهادة الاختبار غير موجودة');
    const issueDate = new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'long', timeZone: 'Africa/Cairo'
    }).format(new Date(certificate.issued_at));
    const percentage = Math.round(certificate.percentage);
    sendCertificateDocument(res, {
      pageTitle: `شهادة اختبار - ${certificate.student_name}`,
      eyebrow: 'شهادة إنجاز أكاديمي',
      title: certificate.exam_title,
      studentName: certificate.student_name,
      description: `تقديرًا لإتمامه الاختبار وإظهار مستواه في مادة ${htmlEscape(certificate.subject_name)}.`,
      detail: `المحاضرة: ${htmlEscape(certificate.lecture_title)}`,
      score: `${certificate.score} من ${certificate.total_questions}`,
      percentage,
      issuerName: certificate.issuer_name,
      issueDate,
      certificateNumber: certificate.certificate_number
    });
  });

  const studentFilter = query => {
    const clauses = ['1=1'];
    const args = [];
    if (query.q) { const q = text(query.q, 'البحث', 1, 100); clauses.push('(s.name ILIKE ? ESCAPE \'!\' OR s.code ILIKE ? ESCAPE \'!\')'); const v = `%${q.replace(/[!%_]/g, '!$&')}%`; args.push(v, v); }
    if (query.level_id) { clauses.push('s.level_id=?'); args.push(integer(query.level_id)); }
    if (query.group_id) { clauses.push('s.group_id=?'); args.push(integer(query.group_id)); }
    if (query.active !== 'all') { clauses.push('s.active=?'); args.push(query.active === '0' ? 0 : 1); }
    if (query.booking_cancelled === '0') clauses.push('s.cancelled_at IS NULL');
    if (query.booking_cancelled === '1') clauses.push('s.cancelled_at IS NOT NULL');
    return { where: clauses.join(' AND '), args };
  };
  const filteredStudents = async (query, paging) => {
    const { where, args } = studentFilter(query);
    const sorts = { name: 's.name', code: 's.code', newest: 's.id DESC' };
    let sql = `SELECT s.*,l.name level_name,g.name group_name,u.username FROM students s JOIN levels l ON l.id=s.level_id
      JOIN groups_table g ON g.id=s.group_id JOIN users u ON u.id=s.user_id WHERE ${where} ORDER BY ${sorts[query.sort] || 's.name'},s.id`;
    if (paging) { sql += ' LIMIT ? OFFSET ?'; args.push(paging.size, paging.offset); }
    return await (await db.query(sql, [...args])).rows;
  };
  const countFilteredStudents = async query => {
    const { where, args } = studentFilter(query);
    return await (await db.query(`SELECT COUNT(*) total FROM students s JOIN levels l ON l.id=s.level_id
      JOIN groups_table g ON g.id=s.group_id JOIN users u ON u.id=s.user_id WHERE ${where}`, [...args])).rows[0].total;
  };
  const followUpData = async (query, paging = { size: 20, offset: 0 }) => {
    const threshold = query.absence_threshold === undefined ? DEFAULT_ABSENCE_THRESHOLD : Number(query.absence_threshold);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) fail(400, 'حد الغياب يجب أن يكون بين 1 و100');
    const started = await courseStarted(), { where, args } = studentFilter({ ...query, active: '1', booking_cancelled: '0' });
    const sessionCte = started ? `session_totals AS (
      SELECT e.student_id,COUNT(cs.id) total_sessions,
        SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) present,
        MAX(CASE WHEN a.id IS NOT NULL THEN cs.date END) last_attendance
      FROM enrollments e JOIN course_sessions cs ON cs.group_id=e.group_id
        AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
      LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=e.student_id
      WHERE cs.cancelled=0 AND cs.date<=? GROUP BY e.student_id
    ), recent_sessions AS (
      SELECT e.student_id,cs.date,a.id attendance_id,
        ROW_NUMBER() OVER(PARTITION BY e.student_id ORDER BY cs.date DESC,cs.id DESC) position
      FROM enrollments e JOIN course_sessions cs ON cs.group_id=e.group_id
        AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
      LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=e.student_id
      WHERE cs.cancelled=0 AND cs.date<=?
    ),` : `session_totals AS (SELECT NULL::INTEGER student_id,0 total_sessions,0 present,NULL::TEXT last_attendance WHERE FALSE),
      recent_sessions AS (SELECT NULL::INTEGER student_id,NULL::TEXT date,NULL::INTEGER attendance_id,0 position WHERE FALSE),`;
    const commonCtes = `WITH payment_totals AS (
        SELECT student_id,SUM(amount) paid FROM payments WHERE voided_at IS NULL GROUP BY student_id
      ), ${sessionCte}
      latest_reminders AS (
        SELECT student_id,id,created_at,read_at,is_read,
          ROW_NUMBER() OVER(PARTITION BY student_id ORDER BY id DESC) position
        FROM notifications WHERE type='PAYMENT_REMINDER'
      ), base AS (
        SELECT s.id,s.user_id,s.course_id,s.code,s.name,s.phone,s.level_id,s.group_id,s.course_price_snapshot price,
          s.course_price_snapshot,s.enrolled_on,s.active,s.created_at,s.cancelled_at,
          l.name level_name,g.name group_name,u.username,COALESCE(p.paid,0) paid,
          GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0)) remaining,
          COALESCE(st.total_sessions,0) total_sessions,COALESCE(st.present,0) present,
          COALESCE(st.total_sessions,0)-COALESCE(st.present,0) absent,
          CASE WHEN COALESCE(st.total_sessions,0)>0 THEN ROUND(100.0*COALESCE(st.present,0)/st.total_sessions) ELSE 0 END percentage,
          st.last_attendance,lr.id reminder_id,lr.created_at reminder_sent_at,
          lr.read_at reminder_read_at,lr.is_read reminder_is_read,
          rs1.date last_session_date,rs1.attendance_id last_session_attendance_id,
          rs2.date second_session_date,rs2.attendance_id second_session_attendance_id
        FROM students s JOIN levels l ON l.id=s.level_id JOIN groups_table g ON g.id=s.group_id
        JOIN users u ON u.id=s.user_id LEFT JOIN payment_totals p ON p.student_id=s.id
        LEFT JOIN session_totals st ON st.student_id=s.id
        LEFT JOIN latest_reminders lr ON lr.student_id=s.id AND lr.position=1
        LEFT JOIN recent_sessions rs1 ON rs1.student_id=s.id AND rs1.position=1
        LEFT JOIN recent_sessions rs2 ON rs2.student_id=s.id AND rs2.position=2 WHERE ${where}
      ), categories AS (
        SELECT 'more_than_half' kind,b.* FROM base b WHERE b.price>0 AND b.remaining>b.price/2
        UNION ALL SELECT 'high_absence',b.* FROM base b
          WHERE ${started ? `b.total_sessions>0 AND 100.0*b.absent/b.total_sessions>=${threshold}` : 'FALSE'}
        UNION ALL SELECT 'missed_last_two',b.* FROM base b
          WHERE ${started ? 'b.second_session_date IS NOT NULL AND b.last_session_attendance_id IS NULL AND b.second_session_attendance_id IS NULL' : 'FALSE'}
        UNION ALL SELECT 'no_payment',b.* FROM base b WHERE b.paid=0
      )`;
    const bind = [...(started ? [today(), today()] : []), ...args];
    const countRows = await (await db.query(`${commonCtes} SELECT kind,COUNT(*) total FROM categories GROUP BY kind`, [...bind])).rows;
    const counts = { more_than_half: 0, high_absence: 0, missed_last_two: 0, no_payment: 0 };
    for (const row of countRows) counts[row.kind] = row.total;
    const rows = await (await db.query(`${commonCtes}, ranked AS (
      SELECT categories.*,ROW_NUMBER() OVER(PARTITION BY kind ORDER BY name,id) position FROM categories
    ) SELECT * FROM ranked WHERE position>? AND position<=? ORDER BY kind,position`, [...bind, paging.offset, paging.offset + paging.size])).rows;
    const lists = { more_than_half: [], high_absence: [], missed_last_two: [], no_payment: [] };
    for (const row of rows) {
      const { kind, position, last_session_date, last_session_attendance_id,
        second_session_date, second_session_attendance_id, reminder_id, reminder_sent_at,
        reminder_read_at, reminder_is_read, ...student } = row;
      student.last_attendance = student.last_attendance || null;
      student.last_payment_reminder = reminder_id ? { id: reminder_id, sent_at: reminder_sent_at,
        read_at: reminder_read_at, is_read: Boolean(reminder_is_read) } : null;
      if (kind === 'high_absence') {
        student.absence_percentage = Math.round(student.absent / student.total_sessions * 1000) / 10;
        student.presence_percentage = Math.round(student.present / student.total_sessions * 1000) / 10;
      }
      if (kind === 'missed_last_two') student.last_two_sessions = [
        { date: last_session_date, status: last_session_attendance_id ? 'حاضر' : 'غائب' },
        { date: second_session_date, status: second_session_attendance_id ? 'حاضر' : 'غائب' }
      ];
      lists[kind].push(student);
    }
    return { threshold, counts, lists };
  };
  app.get('/api/follow-up', staff, async (req, res) => {
    const page = integer(req.query.page || 1), size = Math.min(integer(req.query.size || 20), 100);
    const data = await followUpData(req.query, { size, offset: (page - 1) * size });
    res.json({ ...data, list_totals: data.counts, page, size });
  });
  app.post('/api/notifications/payment-reminder', operator, async (req, res) => {
    fields(req.body, ['student_id', 'message']);
    const student = await studentRow(integer(req.body.student_id)), message = text(req.body.message, 'رسالة التذكير', 10, 1000);
    if (!student.active) fail(400, 'لا يمكن تذكير حساب طالب معطل');
    if (student.cancelled_at) fail(400, 'الحجز ملغي ولا يحتاج إلى تذكير دفع');
    const snapshot = student.course_price_snapshot, paid = await paidAmount(student.id), remaining = Math.max(0, snapshot - paid);
    if (remaining <= 0) fail(400, 'لا يوجد مبلغ مستحق لإرسال تذكير به');
    const id = await transaction(db, async () => {
      const id = Number(await (await db.query(`INSERT INTO notifications(student_id,title,message,type,created_by,metadata)
        VALUES(?,? ,?,'PAYMENT_REMINDER',?,?)`, [student.id, 'تذكير بالدفع', message, req.user.id, JSON.stringify({ course_price: snapshot, paid, remaining })])).lastInsertRowid);
      await audit(db, req.user, 'إرسال تذكير دفع داخل الموقع', 'notification', id,
        { student_id: student.id, name: student.name, remaining });
      return id;
    });
    res.status(201).json({ id, title: 'تذكير بالدفع', student_id: student.id,
      course_price: snapshot, paid, remaining, created_at: await (await db.query('SELECT created_at FROM notifications WHERE id=?', [id])).rows[0].created_at });
  });
  app.get('/api/students', staff, async (req, res) => {
    const page = integer(req.query.page || 1), size = Math.min(integer(req.query.size || 20), 100);
    const rows = await filteredStudents(req.query, { size, offset: (page - 1) * size });
    res.json({ items: await Promise.all(rows.map(summarize)), total: await countFilteredStudents(req.query), page, size });
  });
  app.get('/api/students/lookup', staff, async (req, res) => {
    let row;
    if (req.query.token) row = await (await db.query('SELECT id FROM students WHERE qr_token=? AND active=1 AND cancelled_at IS NULL', [text(req.query.token, 'QR', 64, 64)])).rows[0];
    else row = await (await db.query('SELECT id FROM students WHERE code=? AND active=1 AND cancelled_at IS NULL', [studentCode(req.query.code)])).rows[0];
    if (!row) fail(404, 'لم يتم العثور على طالب نشط وغير ملغي بهذا الكود أو QR');
    res.json(await detail(await studentRow(row.id)));
  });
  app.post('/api/students', operator, async (req, res) => {
    fields(req.body, ['name', 'code', 'level_id', 'group_id', 'phone', 'price', 'username', 'password',
      'initial_payment', 'notify_initial_payment']);
    const b = req.body, name = text(b.name, 'الاسم', 2), code = studentCode(b.code), level = integer(b.level_id), group = integer(b.group_id);
      if (!await courseStarted()) await ensureBookingOpen();
    await groupCheck(level, group);
    const login = username(b.username), hash = passwordHash(password(b.password));
    const phone = b.phone ? text(b.phone, 'الهاتف', 5, 24) : '';
      const initialPayment = b.initial_payment === undefined ? 0 : money(b.initial_payment);
      const notifyInitialPayment = b.notify_initial_payment === undefined ? false : bool(b.notify_initial_payment);
    const priceRow = await (await db.query('SELECT price FROM level_course_prices WHERE level_id=?', [level])).rows[0];
    if (!priceRow) fail(400, 'لم يتم ضبط سعر لهذه الفرقة بعد');
    const price = priceRow.price;
    if (price <= 0) fail(409, 'اضبط سعر الكورس لهذه الفرقة من الإعدادات قبل إنشاء الحجز');
      if (initialPayment > price) fail(400, 'الدفعة الأولى أكبر من سعر الكورس');
    if (b.price !== undefined && money(b.price) !== price) fail(400, 'سعر الحجز يحدد تلقائيًا حسب الفرقة ولا يمكن تغييره للطالب');
    const id = await transaction(db, async () => {
      if (await (await db.query('SELECT id FROM students WHERE code=?', [code])).rows[0]) fail(409, 'هذا الكود مستخدم بالفعل. من فضلك أدخل كودًا آخر.');
      if (await (await db.query('SELECT id FROM users WHERE username=?', [login])).rows[0]) fail(409, 'اسم الدخول مستخدم بالفعل');
      const uid = await (await db.query("INSERT INTO users(name,username,password_hash,role) VALUES(?,?,?,'student')", [name, login, hash])).lastInsertRowid;
      const sid = Number(await (await db.query(`INSERT INTO students(user_id,code,name,phone,level_id,group_id,price,course_price_snapshot,qr_token,enrolled_on) VALUES(?,?,?,?,?,?,?,?,?,?)`, [uid, code, name, phone, level, group, price, price, token(), today()])).lastInsertRowid);
      await db.query('INSERT INTO enrollments(student_id,group_id,starts_on) VALUES(?,?,?)', [sid, group, today()]);
      await audit(db, req.user, 'إنشاء طالب', 'student', sid, { name, code, level, group, price });
      if (initialPayment > 0) {
        const paymentId = Number(await (await db.query('INSERT INTO payments(student_id,amount,recorded_by,request_key) VALUES(?,?,?,?)', [sid, initialPayment, req.user.id, token()])).lastInsertRowid);
        await audit(db, req.user, 'تسجيل دفعة', 'student', sid, { name, amount: initialPayment, payment_id: paymentId, source: 'booking' });
      }
      if (notifyInitialPayment && price > initialPayment) {
        const remaining = price - initialPayment;
        const message = `تذكير بالدفع: متبقي عليك ${remaining / 100} جنيه من قيمة الكورس. برجاء سداد المبلغ المتبقي في أقرب وقت. — S.T.C - مركز السويس للتدريب`;
        const notificationId = Number(await (await db.query(`INSERT INTO notifications(student_id,title,message,type,created_by,metadata)
          VALUES(?,? ,?,'PAYMENT_REMINDER',?,?)`, [sid, 'تذكير بالدفع', message, req.user.id, JSON.stringify({ course_price: price, paid: initialPayment, remaining })])).lastInsertRowid);
        await audit(db, req.user, 'إرسال تذكير دفع داخل الموقع', 'notification', notificationId,
          { student_id: sid, name, remaining, source: 'booking' });
      }
      return sid;
    }); res.status(201).json(await detail(await studentRow(id)));
  });
  app.get('/api/students/:id', async (req, res) => res.json(await detail(await owned(req, integer(req.params.id)))));
  app.get('/api/students/:id/qr', async (req, res) => {
    const s = await owned(req, integer(req.params.id));
    res.set('Content-Type', 'image/png').send(await QRCode.toBuffer(`course:${s.qr_token}`, { width: 600, margin: 3, errorCorrectionLevel: 'M' }));
  });
  app.patch('/api/students/:id', operator, async (req, res) => {
    fields(req.body, ['name', 'code', 'level_id', 'group_id', 'phone', 'price', 'active', 'cancelled']);
    const old = await studentRow(integer(req.params.id)), b = req.body;
    const name = b.name === undefined ? old.name : text(b.name, 'الاسم', 2);
    const code = b.code === undefined ? old.code : studentCode(b.code);
    const level = b.level_id === undefined ? old.level_id : integer(b.level_id), group = b.group_id === undefined ? old.group_id : integer(b.group_id);
    const phone = b.phone === undefined ? old.phone : b.phone === '' ? '' : text(b.phone, 'الهاتف', 5, 24);
    const price = old.course_price_snapshot, active = b.active === undefined ? old.active : bool(b.active);
    const cancelled = b.cancelled === undefined ? Boolean(old.cancelled_at) : bool(b.cancelled);
    if (b.price !== undefined && money(b.price) !== price) fail(400, 'سعر الحجز محفوظ وقت التسجيل ولا يمكن تغييره للطالب');
    await groupCheck(level, group);
    await transaction(db, async () => {
      if (await (await db.query('SELECT id FROM students WHERE code=? AND id<>?', [code, old.id])).rows[0]) fail(409, 'هذا الكود مستخدم بالفعل. من فضلك أدخل كودًا آخر.');
      if (group !== old.group_id) {
        if (await (await db.query(`SELECT a.id FROM attendance a JOIN course_sessions cs ON cs.id=a.session_id WHERE a.student_id=? AND cs.date>=?`, [old.id, today()])).rows[0]) fail(409, 'لا يمكن نقل الطالب بعد تسجيل حضور اليوم؛ صحح الحضور أولًا أو انقله غدًا');
        await db.query('UPDATE enrollments SET ends_on=? WHERE student_id=? AND ends_on IS NULL', [today(), old.id]);
        await db.query('INSERT INTO enrollments(student_id,group_id,starts_on) VALUES(?,?,?)', [old.id, group, today()]);
      }
      const cancelledAt = cancelled ? old.cancelled_at || new Date().toISOString() : null;
      await db.query('UPDATE students SET name=?,code=?,level_id=?,group_id=?,phone=?,active=?,cancelled_at=? WHERE id=?', [name, code, level, group, phone, active, cancelledAt, old.id]);
      await db.query('UPDATE users SET name=?,active=? WHERE id=?', [name, active, old.user_id]);
      if (!active) await db.query('DELETE FROM auth_sessions WHERE user_id=?', [old.user_id]);
      await audit(db, req.user, cancelled === Boolean(old.cancelled_at) ? 'تعديل طالب' : cancelled ? 'إلغاء حجز طالب' : 'إعادة تفعيل حجز طالب', 'student', old.id,
        { before: { name: old.name, code: old.code, level: old.level_id, group: old.group_id, price, active: old.active, cancelled: Boolean(old.cancelled_at) },
          after: { name, code, level, group, price, active, cancelled } });
    }); res.json(await detail(await studentRow(old.id)));
  });
  app.delete('/api/students/:id', operator, async (req, res) => {
    const s = await studentRow(integer(req.params.id));
    await transaction(db, async () => {
      if (await (await db.query('SELECT id FROM attendance WHERE student_id=? LIMIT 1', [s.id])).rows[0] || await (await db.query('SELECT id FROM payments WHERE student_id=? LIMIT 1', [s.id])).rows[0]) fail(409, 'للطالب سجلات حضور أو مدفوعات؛ استخدم التعطيل للحفاظ على السجلات');
      await audit(db, req.user, 'حذف طالب بلا معاملات', 'student', s.id, { name: s.name, code: s.code });
      await db.query('DELETE FROM students WHERE id=?', [s.id]); await db.query('DELETE FROM users WHERE id=?', [s.user_id]);
    }); res.json({ ok: true });
  });
  app.post('/api/students/:id/qr/rotate', operator, async (req, res) => {
    const s = await studentRow(integer(req.params.id));
    await transaction(db, async () => { await db.query('UPDATE students SET qr_token=? WHERE id=?', [token(), s.id]); await audit(db, req.user, 'إبطال QR وإنشاء بديل', 'student', s.id); }); res.json({ ok: true });
  });
  app.post('/api/students/:id/password', operator, async (req, res) => {
    fields(req.body, ['password']); const s = await studentRow(integer(req.params.id)); const hash = passwordHash(password(req.body.password));
    await transaction(db, async () => {
      await db.query('UPDATE users SET password_hash=? WHERE id=?', [hash, s.user_id]);
      await db.query('DELETE FROM auth_sessions WHERE user_id=?', [s.user_id]); await audit(db, req.user, 'إعادة تعيين كلمة مرور الطالب', 'student', s.id);
    }); res.json({ ok: true });
  });

  app.get('/api/session-options', staff, async (req, res) => res.json({
    doctors: await (await db.query(`SELECT id,name FROM users
      WHERE active=1 AND (
        role='doctor' OR
        (role='admin' AND LOWER(username) IN ('rashad','elnashar','elalfy'))
      )
      ORDER BY id`, [])).rows,
    subjects: await (await db.query('SELECT id,doctor_id,level_id,name FROM subjects ORDER BY name,id', [])).rows
  }));
  const resolveSessionAcademicDetails = async (doctorId, subjectId, levelId) => {
    const details = await (await db.query(`SELECT s.id subject_id,s.name subject_name,s.level_id,u.id doctor_id,u.name doctor_name
      FROM subjects s JOIN users u ON u.id=s.doctor_id
      WHERE s.id=? AND s.doctor_id=? AND u.active=1 AND (
        u.role='doctor' OR
        (u.role='admin' AND LOWER(u.username) IN ('rashad','elnashar','elalfy'))
      )`, [subjectId, doctorId])).rows[0];
    if (!details) fail(400, 'اختيار الدكتور والمادة غير صحيح');
    if (details.level_id !== levelId) fail(400, 'المادة لا تتبع فرقة المجموعة المختارة');
    return details;
  };
  app.get('/api/sessions', staff, async (req, res) => {
    const params = [], clauses = [];
    if (req.query.group_id) { clauses.push('cs.group_id=?'); params.push(integer(req.query.group_id)); }
    if (req.query.date) { clauses.push('cs.date=?'); params.push(date(req.query.date)); }
    const sessions = await (await db.query(`SELECT cs.*,g.name group_name,l.name level_name,u.name doctor_name,s.name subject_name FROM course_sessions cs
      JOIN groups_table g ON g.id=cs.group_id JOIN levels l ON l.id=g.level_id
      LEFT JOIN users u ON u.id=cs.doctor_id LEFT JOIN subjects s ON s.id=cs.subject_id
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY cs.date DESC,cs.id DESC`, [...params])).rows;
    const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    res.json(sessions.map(session => {
      const status = session.cancelled ? 'cancelled' : session.date < today() ? 'ended' : session.date > today() ? 'scheduled' :
        session.start_time && currentTime < session.start_time ? 'scheduled' : session.end_time && currentTime >= session.end_time ? 'ended' :
          session.start_time ? 'started' : 'scheduled';
      return { ...session, status };
    }));
  });
  app.post('/api/sessions', operator, async (req, res) => {
    fields(req.body, ['group_id', 'date', 'title', 'start_time', 'end_time', 'doctor_id', 'subject_id']); const b = req.body, group = integer(b.group_id), day = date(b.date), title = text(b.title, 'عنوان المحاضرة', 2);
    const startTime = clockTime(b.start_time, 'وقت البداية'), endTime = clockTime(b.end_time, 'وقت النهاية');
    const doctorId = integer(b.doctor_id), subjectId = integer(b.subject_id);
    if (startTime && endTime && endTime <= startTime) fail(400, 'وقت النهاية يجب أن يكون بعد البداية');
    const groupDetails = await (await db.query('SELECT id,level_id FROM groups_table WHERE id=?', [group])).rows[0];
    if (!groupDetails) fail(400, 'المجموعة غير موجودة');
    const academicDetails = await resolveSessionAcademicDetails(doctorId, subjectId, groupDetails.level_id);
    const id = await transaction(db, async () => {
      if (await (await db.query('SELECT id FROM course_sessions WHERE group_id=? AND date=?', [group, day])).rows[0]) fail(409, 'توجد محاضرة لهذه المجموعة في هذا اليوم بالفعل');
      const id = Number(await (await db.query(`INSERT INTO course_sessions(group_id,date,title,start_time,end_time,starts_at_utc,doctor_id,subject_id)
        VALUES(?,?,?,?,?,?,?,?)`, [group, day, title, startTime, endTime, sessionStartsAtUtc(day, startTime), doctorId, subjectId])).lastInsertRowid);
      const groupName = await (await db.query('SELECT name FROM groups_table WHERE id=?', [group])).rows[0].name;
      const message = `تم تحديد محاضرة ${title} في مادة ${academicDetails.subject_name} مع الدكتور ${academicDetails.doctor_name} لمجموعتك ${groupName} بتاريخ ${day}${startTime ? ` الساعة ${formatClockTime(startTime)}` : ''}${endTime ? ` حتى ${formatClockTime(endTime)}` : ''}.`;
      const notified = await db.query(`INSERT INTO notifications(student_id,title,message,type,created_by,metadata)
        SELECT DISTINCT s.id,? ,?,'GENERAL',?::INTEGER,?
        FROM students s JOIN enrollments e ON e.student_id=s.id
        WHERE s.active=1 AND s.cancelled_at IS NULL AND e.group_id=?
          AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)`, ['موعد محاضرة جديدة', message, req.user.id, JSON.stringify({ session_id: id, group_id: group, doctor_id: doctorId, subject_id: subjectId }), group, day, day]);
      await audit(db, req.user, 'إضافة محاضرة', 'session', id,
        { group, day, title, doctor_id: doctorId, subject_id: subjectId, start_time: startTime, end_time: endTime, notified_students: notified.changes });
      return id;
    }); res.status(201).json({ id });
  });
  app.patch('/api/sessions/:id', operator, async (req, res) => {
    fields(req.body, ['cancelled', 'group_id', 'date', 'title', 'start_time', 'end_time', 'doctor_id', 'subject_id']);
    const id = integer(req.params.id), old = await (await db.query('SELECT * FROM course_sessions WHERE id=?', [id])).rows[0];
    if (!old) fail(404, 'المحاضرة غير موجودة');
    const group = req.body.group_id === undefined ? old.group_id : integer(req.body.group_id);
    const day = req.body.date === undefined ? old.date : date(req.body.date);
    const title = req.body.title === undefined ? old.title : text(req.body.title, 'عنوان المحاضرة', 2);
    const startTime = req.body.start_time === undefined ? old.start_time : clockTime(req.body.start_time, 'وقت البداية');
    const endTime = req.body.end_time === undefined ? old.end_time : clockTime(req.body.end_time, 'وقت النهاية');
    const doctorId = req.body.doctor_id === undefined ? old.doctor_id : integer(req.body.doctor_id);
    const subjectId = req.body.subject_id === undefined ? old.subject_id : integer(req.body.subject_id);
    const cancelled = req.body.cancelled === undefined ? old.cancelled : bool(req.body.cancelled);
    const groupDetails = await (await db.query('SELECT id,level_id FROM groups_table WHERE id=?', [group])).rows[0];
    if (!groupDetails) fail(400, 'المجموعة غير موجودة');
    const academicSelectionChanged = req.body.doctor_id !== undefined || req.body.subject_id !== undefined;
    if (academicSelectionChanged && (!doctorId || !subjectId)) fail(400, 'يجب اختيار الدكتور والمادة معًا');
    const academicDetails = doctorId && subjectId ? await resolveSessionAcademicDetails(doctorId, subjectId, groupDetails.level_id) : null;
    if (!await (await db.query('SELECT id FROM groups_table WHERE id=?', [group])).rows[0]) fail(400, 'المجموعة غير موجودة');
    if (startTime && endTime && endTime <= startTime) fail(400, 'وقت النهاية يجب أن يكون بعد البداية');
    const scheduleChanged = group !== old.group_id || day !== old.date || title !== old.title ||
      startTime !== old.start_time || endTime !== old.end_time || doctorId !== old.doctor_id || subjectId !== old.subject_id;
    const reminderSentAt = scheduleChanged || cancelled !== old.cancelled ? null : old.reminder_sent_at;
    await transaction(db, async () => {
      if ((group !== old.group_id || day !== old.date) && await (await db.query('SELECT id FROM attendance WHERE session_id=? LIMIT 1', [id])).rows[0]) fail(409, 'لا يمكن تغيير تاريخ أو مجموعة محاضرة لها سجلات حضور');
      if (await (await db.query('SELECT id FROM course_sessions WHERE group_id=? AND date=? AND id<>?', [group, day, id])).rows[0]) fail(409, 'توجد محاضرة لهذه المجموعة في هذا اليوم بالفعل');
      await db.query(`UPDATE course_sessions SET group_id=?,date=?,title=?,start_time=?,end_time=?,cancelled=?,
        starts_at_utc=?,reminder_sent_at=?,doctor_id=?,subject_id=? WHERE id=?`, [group, day, title, startTime, endTime, cancelled, sessionStartsAtUtc(day, startTime), reminderSentAt, doctorId, subjectId, id]);
      const statusChanged = cancelled !== old.cancelled;
      if (scheduleChanged || statusChanged) {
        const recipientGroup = cancelled ? old.group_id : group;
        const recipientDate = cancelled ? old.date : day;
        const messageDetails = cancelled && old.doctor_id && old.subject_id
          ? await (await db.query(`SELECT s.name subject_name,u.name doctor_name FROM subjects s JOIN users u ON u.id=s.doctor_id
            WHERE s.id=? AND u.id=?`, [old.subject_id, old.doctor_id])).rows[0]
          : academicDetails;
        const academicLabel = messageDetails ? ` في مادة ${messageDetails.subject_name} مع الدكتور ${messageDetails.doctor_name}` : '';
        const eventTitle = cancelled ? 'إلغاء محاضرة' : 'تحديث موعد محاضرة';
        const message = cancelled
          ? `تم إلغاء محاضرة ${old.title}${academicLabel} لمجموعتك بتاريخ ${old.date}.`
          : `تم تحديث موعد محاضرة ${title}${academicLabel} لمجموعتك بتاريخ ${day}${startTime ? ` الساعة ${formatClockTime(startTime)}` : ''}${endTime ? ` حتى ${formatClockTime(endTime)}` : ''}.`;
        const notified = await db.query(`INSERT INTO notifications(student_id,title,message,type,created_by,metadata)
          SELECT DISTINCT s.id,?,?,'GENERAL',?::INTEGER,?
          FROM students s JOIN enrollments e ON e.student_id=s.id
          WHERE s.active=1 AND s.cancelled_at IS NULL AND e.group_id=?
            AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)`, [eventTitle, message, req.user.id, JSON.stringify({ session_id: id, group_id: recipientGroup, doctor_id: cancelled ? old.doctor_id : doctorId, subject_id: cancelled ? old.subject_id : subjectId }), recipientGroup, recipientDate, recipientDate]);
        await audit(db, req.user, 'إرسال إشعار تحديث محاضرة', 'session', id,
          { recipients: notified.changes, group_id: recipientGroup, date: recipientDate, cancelled });
      }
      await audit(db, req.user, cancelled === old.cancelled ? 'تعديل موعد محاضرة' : cancelled ? 'إلغاء محاضرة' : 'استعادة محاضرة', 'session', id,
        { before: old, after: { group_id: group, date: day, title, doctor_id: doctorId, subject_id: subjectId, start_time: startTime, end_time: endTime, cancelled } });
    });
    res.json({ ok: true });
  });
  app.post('/api/attendance', operator, async (req, res) => {
    fields(req.body, ['student_id', 'session_id']);
    if (!await courseStarted()) fail(409, 'لم يبدأ الكورس بعد؛ تسجيل الحضور غير متاح');
    const s = await studentRow(integer(req.body.student_id)); if (!s.active) fail(400, 'حساب الطالب معطل');
    if (s.cancelled_at) fail(400, 'الحجز ملغي ولا يمكن تسجيل الحضور');
    const session = await (await db.query('SELECT * FROM course_sessions WHERE id=? AND cancelled=0', [integer(req.body.session_id)])).rows[0];
    if (!session || session.date > today()) fail(400, 'المحاضرة غير موجودة أو ملغاة أو لم يحن موعدها');
    if (req.user.role === 'assistant' && session.date !== today()) fail(403, 'دنيا تستطيع تسجيل حضور اليوم فقط؛ التصحيح للأيام السابقة للإدارة');
    if (!await (await db.query('SELECT id FROM enrollments WHERE student_id=? AND group_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>?)', [s.id, session.group_id, session.date, session.date])).rows[0]) fail(400, 'الطالب غير مسجل في مجموعة هذه المحاضرة بتاريخها');
    const id = await transaction(db, async () => {
      if (await (await db.query('SELECT id FROM attendance WHERE student_id=? AND session_id=?', [s.id, session.id])).rows[0]) fail(409, 'تم تسجيل حضور هذا الطالب اليوم بالفعل ✓');
      const id = Number(await (await db.query('INSERT INTO attendance(student_id,session_id,recorded_by) VALUES(?,?,?)', [s.id, session.id, req.user.id])).lastInsertRowid);
      await audit(db, req.user, 'تسجيل حضور', 'student', s.id, { name: s.name, session_id: session.id, date: session.date }); return id;
    }); res.status(201).json({ id, message: `تم تسجيل حضور ${s.name} بنجاح ✓` });
  });
  app.delete('/api/attendance/:id', operator, async (req, res) => {
    fields(req.body, ['reason']); const reason = text(req.body.reason, 'سبب تصحيح الحضور', 5, 300), id = integer(req.params.id);
    await transaction(db, async () => {
      const row = await (await db.query('SELECT * FROM attendance WHERE id=?', [id])).rows[0]; if (!row) fail(404, 'السجل غير موجود');
      await db.query('DELETE FROM attendance WHERE id=?', [id]); await audit(db, req.user, 'تصحيح حضور إلى غياب', 'student', row.student_id, { reason, attendance: row });
    }); res.json({ ok: true });
  });
  app.post('/api/payments', operator, async (req, res) => {
    fields(req.body, ['student_id', 'amount', 'request_key', 'notify_remaining', 'notification_message']);
    const id = integer(req.body.student_id), amount = money(req.body.amount), key = text(req.body.request_key, 'مفتاح العملية', 16, 100);
    if (amount <= 0) fail(400, 'الدفعة يجب أن تكون أكبر من صفر');
    const notifyRemaining = req.body.notify_remaining === undefined ? false : bool(req.body.notify_remaining);
    const customMessage = req.body.notification_message === undefined ? null : text(req.body.notification_message, 'رسالة التذكير', 10, 1000);
    const result = await transaction(db, async () => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [key]);
      const previous = await (await db.query('SELECT * FROM payments WHERE request_key=?', [key])).rows[0];
      if (previous) {
        if (previous.student_id !== id || previous.amount !== amount || previous.recorded_by !== req.user.id) fail(409, 'مفتاح عملية مستخدم لطلب مختلف');
        return { id: previous.id, repeated: true };
      }
      await db.query('SELECT id FROM students WHERE id=? FOR UPDATE', [id]);
      const s = await studentRow(id); if (!s.active) fail(400, 'حساب الطالب معطل');
      if (s.cancelled_at) fail(400, 'الحجز ملغي ولا يقبل دفعات');
      if (amount > s.course_price_snapshot - await paidAmount(id)) fail(400, 'المبلغ أكبر من المتبقي على الطالب');
      const pid = Number(await (await db.query('INSERT INTO payments(student_id,amount,recorded_by,request_key) VALUES(?,?,?,?)', [id, amount, req.user.id, key])).lastInsertRowid);
      await audit(db, req.user, 'تسجيل دفعة', 'student', id, { name: s.name, amount, payment_id: pid });
      let notificationId = null;
      const remaining = Math.max(0, s.course_price_snapshot - await paidAmount(id));
      if (notifyRemaining && remaining > 0) {
        const message = customMessage || `تذكير بالدفع: متبقي عليك ${remaining / 100} جنيه من قيمة الكورس. برجاء سداد المبلغ المتبقي في أقرب وقت. — S.T.C - مركز السويس للتدريب`;
        notificationId = Number(await (await db.query(`INSERT INTO notifications(student_id,title,message,type,created_by,metadata)
          VALUES(?,? ,?,'PAYMENT_REMINDER',?,?)`, [id, 'تذكير بالدفع', message, req.user.id, JSON.stringify({ course_price: s.course_price_snapshot, paid: s.course_price_snapshot - remaining, remaining })])).lastInsertRowid);
        await audit(db, req.user, 'إرسال تذكير دفع داخل الموقع', 'notification', notificationId,
          { student_id: id, name: s.name, remaining, source: 'payment' });
      }
      return { id: pid, repeated: false, notification_id: notificationId };
    }); res.status(result.repeated ? 200 : 201).json({ ...result, student: await detail(await studentRow(id)) });
  });
  app.get('/api/payments/:id/receipt', staff, async (req, res) => {
    const id = integer(req.params.id, 'رقم الدفعة');
    const payment = (await db.query(`SELECT p.id,p.amount,p.created_at,p.voided_at,
        s.code student_code,s.name student_name,l.name level_name,g.name group_name,u.name recorded_by
      FROM payments p
      JOIN students s ON s.id=p.student_id
      JOIN levels l ON l.id=s.level_id
      JOIN groups_table g ON g.id=s.group_id
      JOIN users u ON u.id=p.recorded_by
      WHERE p.id=?`, [id])).rows[0];
    if (!payment) fail(404, 'الدفعة غير موجودة');
    if (payment.voided_at) fail(409, 'لا يمكن إنشاء إيصال لدفعة ملغاة');
    const createdAt = new Date(payment.created_at);
    if (!Number.isFinite(createdAt.getTime())) throw new Error(`Invalid created_at value for payment ${id}`);
    const receipt = {
      number: `STC-${new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric' }).format(createdAt)}-${String(payment.id).padStart(6, '0')}`,
      student_name: payment.student_name,
      student_code: payment.student_code,
      level_name: payment.level_name,
      group_name: payment.group_name,
      date: new Intl.DateTimeFormat('ar-EG', {
        timeZone: 'Africa/Cairo', dateStyle: 'long', timeStyle: 'short'
      }).format(createdAt),
      amount: (Number(payment.amount) / 100).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      recorded_by: payment.recorded_by
    };
    const pdf = await renderPdf(paymentReceiptHtml(receipt), {
      format: 'A5', printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' }
    });
    res.attachment(`receipt-${receipt.number}.pdf`).type('application/pdf').send(pdf);
  });
  app.post('/api/payments/:id/void', operator, async (req, res) => {
    fields(req.body, ['reason']); const reason = text(req.body.reason, 'سبب إلغاء الدفعة', 5, 300), id = integer(req.params.id);
    await transaction(db, async () => {
      const p = await (await db.query('SELECT * FROM payments WHERE id=?', [id])).rows[0]; if (!p) fail(404, 'الدفعة غير موجودة'); if (p.voided_at) fail(409, 'الدفعة ملغاة بالفعل');
      await db.query(`UPDATE payments SET void_reason=?,voided_by=?,voided_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE id=?`, [reason, req.user.id, id]);
      await audit(db, req.user, 'إلغاء دفعة', 'student', p.student_id, { payment_id: id, amount: p.amount, reason });
    }); res.json({ ok: true });
  });

  registerAcademicRoutes(app, db);
  registerSystemResetRoutes(app, db, { onComplete: () => { settingsCache = undefined; } });
  registerAiAssistantRoutes(app, db);

  app.get('/api/dashboard', staff, async (req, res) => {
    const day = today();
    const grouped = await (await db.query(`WITH paid AS (SELECT student_id,SUM(amount) amount FROM payments WHERE voided_at IS NULL GROUP BY student_id)
      SELECT s.level_id,s.group_id,COUNT(*) students,
        SUM(CASE WHEN s.cancelled_at IS NULL THEN 1 ELSE 0 END) bookings,
        SUM(CASE WHEN s.cancelled_at IS NOT NULL THEN 1 ELSE 0 END) cancelled,
        SUM(CASE WHEN s.cancelled_at IS NULL AND COALESCE(p.amount,0)=0 THEN 1 ELSE 0 END) unpaid,
        SUM(CASE WHEN s.cancelled_at IS NULL AND COALESCE(p.amount,0)>0 AND COALESCE(p.amount,0)<s.course_price_snapshot THEN 1 ELSE 0 END) partial,
        SUM(CASE WHEN s.cancelled_at IS NULL AND COALESCE(p.amount,0)>0 AND COALESCE(p.amount,0)>=s.course_price_snapshot THEN 1 ELSE 0 END) confirmed,
        SUM(COALESCE(p.amount,0)) paid,
        SUM(CASE WHEN s.cancelled_at IS NULL THEN GREATEST(0,s.course_price_snapshot-COALESCE(p.amount,0)) ELSE 0 END) remaining
      FROM students s LEFT JOIN paid p ON p.student_id=s.id WHERE s.active=1 GROUP BY s.level_id,s.group_id`, [])).rows;
    const daily = await courseStarted() ? await (await db.query(`SELECT e.group_id,COUNT(DISTINCT s.id) scheduled,
      COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN s.id END) present
      FROM course_sessions cs JOIN enrollments e ON e.group_id=cs.group_id AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
      JOIN students s ON s.id=e.student_id AND s.active=1 AND s.cancelled_at IS NULL
      LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=s.id
      WHERE cs.date=? AND cs.cancelled=0 GROUP BY e.group_id`, [day])).rows : [];
    const dailyByGroup = new Map(daily.map(row => [row.group_id, row]));
    const aggregate = groupIds => {
      const rows = grouped.filter(row => groupIds.includes(row.group_id));
      const scheduled = groupIds.map(id => dailyByGroup.get(id)).filter(Boolean);
      const sum = key => rows.reduce((total, row) => total + row[key], 0);
      return { students: sum('students'), bookings: sum('bookings'), cancelled: sum('cancelled'), unpaid: sum('unpaid'),
        partial: sum('partial'), confirmed: sum('confirmed'), paid: sum('paid'), remaining: sum('remaining'),
        scheduled: scheduled.reduce((total, row) => total + row.scheduled, 0),
        present: scheduled.reduce((total, row) => total + row.present, 0),
        absent: scheduled.reduce((total, row) => total + row.scheduled - row.present, 0) };
    };
    const levels = await Promise.all((await db.query('SELECT * FROM levels ORDER BY id', [])).rows.map(async level => {
      const groups = (await db.query('SELECT * FROM groups_table WHERE level_id=? ORDER BY id', [level.id])).rows.map(group => ({ ...group, ...aggregate([group.id]) }));
      return { ...level, ...aggregate(groups.map(group => group.id)), groups };
    }));
    const totals = aggregate(grouped.map(row => row.group_id));
    const booking = { total: totals.bookings, cancelled: totals.cancelled, unpaid: totals.unpaid, partial: totals.partial,
      confirmed: totals.confirmed, paid: totals.paid, remaining: totals.remaining };
    const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const currentSessions = await courseStarted() ? await (await db.query(`SELECT cs.id,cs.title,cs.start_time,cs.end_time,g.name group_name,l.name level_name
      FROM course_sessions cs JOIN groups_table g ON g.id=cs.group_id JOIN levels l ON l.id=g.level_id
      WHERE cs.date=? AND cs.cancelled=0 AND cs.start_time IS NOT NULL AND cs.start_time<=?
      AND (cs.end_time IS NULL OR cs.end_time>?) ORDER BY cs.start_time`, [day, currentTime, currentTime])).rows : [];
    res.json({ today: day, phase: await coursePhase(), booking, ...totals, current_sessions: currentSessions,
      follow_up: await (await followUpData({})).counts, levels });
  });

  app.get('/api/users', admin, async (req, res) => res.json(await (await db.query("SELECT id,name,username,role,active,can_set_price FROM users WHERE role<>'student'", [])).rows));
  app.patch('/api/users/:id', operator, async (req, res) => {
    fields(req.body, ['active', 'password', 'can_set_price']); const id = integer(req.params.id), u = await (await db.query("SELECT * FROM users WHERE id=? AND role='assistant'", [id])).rows[0];
    if (!u) fail(400, 'هذه الشاشة لإدارة حساب المساعدة فقط');
    if (u.id === req.user.id) fail(403, 'لا يمكنك تعديل حسابك من هذه الشاشة');
    const active = req.body.active === undefined ? u.active : bool(req.body.active), permission = req.body.can_set_price === undefined ? u.can_set_price : bool(req.body.can_set_price);
    const hash = req.body.password === undefined ? u.password_hash : passwordHash(password(req.body.password));
    await transaction(db, async () => {
      await db.query('UPDATE users SET active=?,can_set_price=?,password_hash=? WHERE id=?', [active, permission, hash, id]);
      await db.query('DELETE FROM auth_sessions WHERE user_id=?', [id]);
      await audit(db, req.user, 'تحديث حساب المساعدة', 'user', id, { active, can_set_price: permission, password_reset: req.body.password !== undefined });
    }); res.json({ ok: true });
  });
  app.patch('/api/course', operator, async (req, res) => {
    fields(req.body, ['name', 'price']); const name = text(req.body.name, 'اسم الكورس', 2), price = money(req.body.price);
    await transaction(db, async () => {
      const before = await (await db.query('SELECT * FROM courses WHERE id=1', [])).rows[0];
      await db.query(`INSERT INTO courses(id,name,price) VALUES(1,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price`, [name, price]);
      await audit(db, req.user, 'تعديل إعدادات الكورس', 'course', 1, { before, after: { name, price } });
    }); res.json({ ok: true });
  });
  app.post('/api/structure/:type', operator, async (req, res) => {
    const { type } = req.params; if (!['levels', 'groups'].includes(type)) fail(404, 'غير موجود');
    fields(req.body, type === 'levels' ? ['name'] : ['name', 'level_id']);
    const name = text(req.body.name, 'الاسم', 2), level = type === 'groups' ? integer(req.body.level_id) : null;
    if (level && !await (await db.query('SELECT id FROM levels WHERE id=?', [level])).rows[0]) fail(400, 'الفرقة غير موجودة');
    const id = await transaction(db, async () => {
      const id = Number(type === 'levels' ? await (await db.query('INSERT INTO levels(name) VALUES(?)', [name])).lastInsertRowid : await (await db.query('INSERT INTO groups_table(name,level_id) VALUES(?,?)', [name, level])).lastInsertRowid);
      await audit(db, req.user, 'إضافة فرقة أو مجموعة', type, id, { name, level }); return id;
    }); res.status(201).json({ id });
  });
  app.patch('/api/structure/:type/:id', operator, async (req, res) => {
    const table = { levels: 'levels', groups: 'groups_table' }[req.params.type]; if (!table) fail(404, 'غير موجود');
    fields(req.body, ['name']); const name = text(req.body.name, 'الاسم', 2), id = integer(req.params.id);
    await transaction(db, async () => {
      if (!await (await db.query(`SELECT id FROM ${table} WHERE id=?`, [id])).rows[0]) fail(404, 'غير موجود');
      await db.query(`UPDATE ${table} SET name=? WHERE id=?`, [name, id]); await audit(db, req.user, 'تسمية فرقة أو مجموعة', req.params.type, id, { name });
    }); res.json({ ok: true });
  });
  app.delete('/api/structure/:type/:id', operator, async (req, res) => {
    const table = { levels: 'levels', groups: 'groups_table' }[req.params.type]; if (!table) fail(404, 'غير موجود'); const id = integer(req.params.id);
    await transaction(db, async () => {
      if (!await (await db.query(`DELETE FROM ${table} WHERE id=?`, [id])).changes) fail(404, 'غير موجود');
      await audit(db, req.user, 'حذف فرقة أو مجموعة غير مستخدمة', req.params.type, id);
    }); res.json({ ok: true });
  });
  app.get('/api/audit', admin, async (req, res) => {
    const page = integer(req.query.page || 1), args = [], where = req.query.actor_id ? 'WHERE actor_id=?' : '';
    if (req.query.actor_id) args.push(integer(req.query.actor_id));
    res.json({ items: await (await db.query(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT 30 OFFSET ?`, [...args, (page - 1) * 30])).rows, total: await (await db.query(`SELECT COUNT(*) count FROM audit_logs ${where}`, [...args])).rows[0].count, page });
  });

  const report = async query => {
    const type = query.type || 'students'; if (!['students', 'attendance', 'payments', 'daily'].includes(type)) fail(400, 'نوع الكشف غير صحيح');
    const day = query.date ? date(query.date) : today();
    if (type === 'daily') {
      return dailyOperationsReport(db, {
        date: day,
        levelId: query.level_id ? integer(query.level_id, 'الفرقة') : null,
        groupId: query.group_id ? integer(query.group_id, 'المجموعة') : null
      });
    }
    const students = await Promise.all((await filteredStudents(query)).map(summarize));
    const headings = type === 'attendance' ? ['الكود', 'الاسم', 'الفرقة', 'المجموعة', 'الحالة', 'الوقت'] : ['الكود', 'الاسم', 'الفرقة', 'المجموعة', 'الحضور', 'الغياب', 'نسبة الحضور', 'سعر الكورس', 'المدفوع', 'المتبقي', 'دفعات التاريخ المحدد'];
    const rows = await Promise.all(students.map(async s => {
      if (type === 'attendance') {
        const h = await courseStarted() ? (await history(s.id, day)).find(h => h.date === day) : undefined;
        return [s.code, s.name, h?.level_name || s.level_name, h?.group_name || s.group_name, h?.status || 'لا توجد محاضرة', h?.created_at ? new Date(h.created_at).toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '—'];
      }
      const dayPaid = (await db.query('SELECT amount,created_at FROM payments WHERE student_id=? AND voided_at IS NULL', [s.id])).rows
        .filter(p => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(p.created_at)) === day).reduce((sum, p) => sum + p.amount, 0);
      return [s.code, s.name, s.level_name, s.group_name, s.present, s.absent, `${s.percentage}%`, s.price / 100, s.paid / 100, s.remaining / 100, dayPaid / 100];
    }));
    return { title: { students: 'كشف الطلاب والمجموعات', attendance: 'كشف الحضور', payments: 'كشف المدفوعات' }[type], date: day, headings, rows, note: 'الأرصدة تراكمية حتى الآن بالجنيه المصري. دفعات التاريخ المحدد حسب توقيت القاهرة. الغياب يشمل محاضرات اليوم حتى تسجيل الحضور.' };
  };
  app.get('/api/reports', staff, async (req, res) => res.json(await report(req.query)));
  app.get('/api/reports/export', staff, async (req, res) => {
    const data = await report(req.query);
    if (req.query.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      if (data.sections) {
        const summarySheet = workbook.addWorksheet('الملخص', { views: [{ rightToLeft: true }] });
        summarySheet.addRow([data.title, data.date]);
        summarySheet.addRow(['البند', 'العدد أو القيمة']);
        summarySheet.addRows([
          ['عدد المحاضرات', data.summary.session_count],
          ['الطلاب المتوقع حضورهم', data.summary.scheduled],
          ['الحضور', data.summary.present],
          ['الغياب', data.summary.absent],
          ['عدد الدفعات', data.summary.payment_count],
          ['إجمالي المدفوع بالجنيه', data.summary.payment_total]
        ]);
        summarySheet.getRow(2).font = { bold: true };
        summarySheet.columns.forEach(col => { col.width = 28; });
        for (const section of data.sections) {
          const sheet = workbook.addWorksheet(section.title.slice(0, 31), { views: [{ rightToLeft: true }] });
          sheet.addRow([section.title, data.date]);
          sheet.addRow(section.headings);
          section.rows.forEach(row => sheet.addRow(row));
          sheet.getRow(2).font = { bold: true };
          sheet.columns.forEach(col => { col.width = 23; });
        }
      } else {
        const sheet = workbook.addWorksheet('الكشف', { views: [{ rightToLeft: true }] });
        sheet.addRow([data.title, data.date]); sheet.addRow(data.headings); data.rows.forEach(row => sheet.addRow(row));
        sheet.getRow(2).font = { bold: true }; sheet.columns.forEach(col => { col.width = 23; });
      }
      const filename = data.sections ? `daily-report-${data.date}.xlsx` : 'course-report.xlsx';
      res.attachment(filename); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
    } else if (req.query.format === 'pdf') {
      const { reportHtml } = await import('./report.js');
      const pdf = await renderPdf(reportHtml(data), {
        format: 'A4', landscape: true, printBackground: true,
        margin: { top: '14mm', bottom: '14mm', left: '10mm', right: '10mm' }
      });
      res.attachment('course-report.pdf').type('application/pdf').send(pdf);
    } else fail(400, 'صيغة التصدير غير مدعومة');
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));
  app.use('/vendor/flatpickr', express.static(resolve('node_modules/flatpickr/dist'), { etag: true }));
  app.get('/vendor/qr-scanner.js', (req, res) => res.sendFile(resolve('node_modules/html5-qrcode/html5-qrcode.min.js')));
  app.get('/favicon.ico', (req, res) => res.sendFile(resolve('public/favicon.ico')));
  app.get('/favicon.svg', (req, res) => res.sendFile(resolve('public/favicon.svg')));
  app.get('/manifest.webmanifest', (req, res) => res.sendFile(resolve('public/manifest.webmanifest')));
  app.use(express.static(resolve('public'), { etag: true }));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('public/index.html')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500, message = error.message;
    if (status === 413) message = 'حجم ملف النسخة يتجاوز الحد المسموح (100 ميجابايت).';
    if (error.code?.startsWith('ERR_SQLITE')) {
      if (message.includes('UNIQUE constraint')) { status = 409; message = 'هذه البيانات مسجلة بالفعل'; }
      else if (message.includes('FOREIGN KEY constraint')) { status = 409; message = 'السجل مرتبط ببيانات أخرى ولا يمكن حذفه أو استخدامه بهذه الطريقة'; }
    }
    if (status >= 500) { console.error(error); message = 'حدث خطأ بالخادم؛ حاول مجددًا أو تواصل مع الإدارة'; }
    res.status(status).json({ error: message });
  });
  return app;
}