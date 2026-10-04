import { audit, transaction } from './db.js';
import { withSystemDataLock } from './system-reset.js';

const cairoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function formatClockTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '';
  return new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString('ar-EG', {
    timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true
  });
}

export function sessionStartsAtUtc(date, time) {
  if (!date || !time) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wallTime;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(cairoFormatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const cairoTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const correction = wallTime - cairoTime;
    instant += correction;
    if (!correction) break;
  }
  return new Date(instant).toISOString();
}

export async function backfillSessionStartTimes(db) {
  const { rows: sessions } = await db.query(`SELECT id,date,start_time FROM course_sessions
    WHERE starts_at_utc IS NULL AND start_time IS NOT NULL`);
  if (!sessions.length) return 0;
  return transaction(db, async () => {
    for (const session of sessions) {
      await db.query('UPDATE course_sessions SET starts_at_utc=? WHERE id=? AND starts_at_utc IS NULL',
        [sessionStartsAtUtc(session.date, session.start_time), session.id]);
    }
    return sessions.length;
  });
}

export async function deliverDueSessionReminders(db, now = Date.now()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = nowDate.toISOString();
  const cutoffIso = new Date(nowDate.getTime() + 30 * 60 * 1000).toISOString();
  return transaction(db, async () => {
    const { rows: due } = await db.query(`SELECT cs.id,cs.group_id,cs.date,cs.title,cs.start_time,g.name group_name,
        s.name subject_name,u.name doctor_name
      FROM course_sessions cs JOIN groups_table g ON g.id=cs.group_id
      LEFT JOIN subjects s ON s.id=cs.subject_id LEFT JOIN users u ON u.id=cs.doctor_id
      WHERE cs.cancelled=0 AND cs.reminder_sent_at IS NULL
        AND cs.starts_at_utc>? AND cs.starts_at_utc<=? ORDER BY cs.starts_at_utc,cs.id`, [nowIso, cutoffIso]);
    const notify = `INSERT INTO notifications(student_id,title,message,type,created_by,metadata)
      SELECT DISTINCT s.id,? ,?,'GENERAL',?::INTEGER,?
      FROM students s JOIN enrollments e ON e.student_id=s.id
      WHERE s.active=1 AND s.cancelled_at IS NULL AND e.group_id=?
        AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)`;
    const systemActor = { id: null, name: 'النظام' };
    for (const session of due) {
      const academicDetails = session.subject_name && session.doctor_name ? ` في مادة ${session.subject_name} مع الدكتور ${session.doctor_name}` : '';
      const message = `تذكير: محاضرة ${session.title}${academicDetails} لمجموعتك ${session.group_name} تبدأ خلال نصف ساعة (${formatClockTime(session.start_time)}).`;
      const result = await db.query(notify, ['تذكير بموعد المحاضرة', message, null,
        JSON.stringify({ session_id: session.id, group_id: session.group_id, starts_at: session.starts_at_utc }),
        session.group_id, session.date, session.date]);
      const marked = await db.query(`UPDATE course_sessions SET reminder_sent_at=?
        WHERE id=? AND cancelled=0 AND reminder_sent_at IS NULL`, [nowIso, session.id]);
      if (marked.rowCount) {
        await audit(db, systemActor, 'إرسال تذكير محاضرة قبل موعدها', 'session', session.id,
          { recipients: result.changes, group_id: session.group_id, date: session.date, start_time: session.start_time });
      }
    }
    return due.length;
  });
}

export async function startSessionReminderWorker(db, intervalMs = 15000) {
  await withSystemDataLock(db, () => backfillSessionStartTimes(db));
  const run = async () => {
    try { await withSystemDataLock(db, () => deliverDueSessionReminders(db)); }
    catch (error) { console.error('Session reminder delivery failed:', error); }
  };
  await run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}