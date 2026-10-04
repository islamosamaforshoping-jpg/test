import { audit, today, transaction } from './db.js';
import { dailyOperationsReport } from './daily-report.js';

const STAFF_ROLES = new Set(['doctor', 'assistant', 'admin']);
const READ_TOOLS = {
  student: new Set(['schedule', 'attendance', 'balance', 'exams', 'results', 'profile']),
  doctor: new Set(['schedule', 'attendance', 'dues', 'exams', 'results', 'groupReport', 'stats', 'studentLookup']),
  assistant: new Set(['schedule', 'attendance', 'dues', 'exams', 'results', 'groupReport', 'stats', 'studentLookup']),
  admin: new Set(['schedule', 'attendance', 'dues', 'exams', 'results', 'groupReport', 'stats', 'studentLookup'])
};
const ACTION_EXPIRY_MS = 10 * 60 * 1000;

const lexicons = {
  schedule: ['محاضره', 'محاضرات', 'محاظره', 'محاظرات', 'جدول', 'حصه', 'حصص', 'جلسه', 'جلسات', 'ميعاد', 'مواعيد', 'lecture', 'schedule'],
  attendance: ['حضور', 'حضرت', 'حضر', 'حاضرين', 'حضوري', 'غاب', 'غبت', 'غياب', 'غيابي', 'غايب', 'غايبين', 'attendance', 'absent', 'present'],
  balance: ['عليا', 'علي', 'رصيد', 'باقي', 'متبقي', 'فاضل', 'ادفع', 'فلوس', 'مبلغ', 'مديون', 'دفع', 'دفعت', 'دفعات', 'مدفوع', 'مدفوعات', 'سداد', 'مستحق', 'مستحقات', 'payment', 'balance', 'paid'],
  dues: ['عليه', 'عليهم', 'مدفعش', 'مدفعتش', 'مادفعش', 'ما دفع', 'لسه', 'مستحق', 'مستحقات', 'فلوس', 'متاخر', 'ديون', 'unpaid'],
  exams: ['امتحان', 'امتحانات', 'اختبار', 'اختبارات', 'exam', 'exams', 'quiz'],
  results: ['درجه', 'درجات', 'نتيجه', 'نتايج', 'علامه', 'علامات', 'score', 'result', 'marks', 'تقدير'],
  report: ['تقرير', 'تقارير', 'ملخص', 'كشف', 'report'],
  profile: ['بياناتي', 'بيانات', 'ملفي', 'حسابي', 'اسمي', 'profile', 'my account'],
  studentLookup: ['بيانات الطالب', 'دفع فلوس', 'دفع الكورس', 'رصيد الطالب', 'student details'],
  upcoming: ['قادم', 'قادمه', 'جايه', 'جاي', 'القادمه', 'الجاية', 'الاسبوع الجاي', 'upcoming', 'next']
};

const studentQueryStopWords = new Set([
  'هل', 'هو', 'هي', 'مين', 'من', 'اللي', 'الطالب', 'طالبه', 'طلاب', 'طالب', 'بياناتي',
  'بيانات', 'بياناته', 'بياناتها', 'ملف', 'ملفاته', 'دفع', 'دفعت', 'مدفوع',
  'مدفوعه', 'يدفع', 'يدفغ', 'فلوس', 'فلوسه', 'الفلوس', 'الكورس', 'كورس',
  'عليه', 'عليها', 'عليهم', 'علي', 'عليا', 'باقي', 'متبقي', 'متبقيه',
  'رصيد', 'كام', 'كم', 'عنده', 'عندها', 'له', 'لها', 'اللي', 'اسمه', 'اسمها',
  'المجموعه', 'مجموعه', 'جروب', 'دفعة', 'دفعه', 'الدفعة', 'الدفعب', 'فرقه',
  'الفرقه', 'الاولى', 'الاول', 'الثانيه', 'الثاني', 'التانيه', 'التاني',
  'الثالثه', 'الثالث', 'الرابعه', 'الرابع', 'المحاضره', 'محاضره', 'امتحان',
  'امتحانات', 'درجات', 'درجه', 'نتيجه', 'نتايج', 'حضور', 'غياب',
  'فاضل', 'اجمالي', 'مجموع', 'عدد', 'اعرض', 'هات', 'جيب', 'وريني', 'طلع',
  'اعمل', 'سجل', 'اكتب', 'اريد', 'عايز', 'عاوز', 'ممكن', 'اعرف', 'النهارده',
  'النهاردا', 'اليوم', 'بكره', 'غدا', 'النشطين', 'نشطين', 'نشط', 'طلاب',
  'الطلاب', 'مدفوعات', 'مستحقات', 'كامله', 'كامل', 'الكل', 'كل',
  'لسه', 'مدفعش', 'مدفعتش', 'مادفعش', 'ما', 'مدفوعات', 'دفعته', 'طب', 'طيب'
]);

const normalizeArabic = value => String(value ?? '')
  .toLowerCase()
  .normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function hasLexeme(normalized, lexeme) {
  const term = normalizeArabic(lexeme);
  if (!term) return false;
  if (` ${normalized} `.includes(` ${term} `)) return true;
  const tokens = normalized.split(' ').map(token => token.startsWith('ال') ? token.slice(2) : token);
  const target = term.startsWith('ال') ? term.slice(2) : term;
  if (tokens.includes(target)) return true;
  if (target.length >= 4 && tokens.some(token =>
    token.startsWith(target) || (token.length >= 5 && target.startsWith(token)))) return true;
  return false;
}

function lexicalScore(normalized, terms) {
  return terms.reduce((score, term) => score + (hasLexeme(normalized, term) ? 1 : 0), 0);
}

export function detectIntent(message) {
  const normalized = normalizeArabic(message);
  const scores = Object.fromEntries(Object.entries(lexicons)
    .map(([intent, terms]) => [intent, lexicalScore(normalized, terms)]));
  const asksForCount = /(^|\s)(عدد|كم|كام|اجمالي|مجموع|total)(\s|$)/.test(normalized);
  const imperative = /(^|\s)(سجل|سجلي|اثبت|اضف|ضيف|علم|اعرض|هات|جيب|وريني|طلع|اعمل|اعرضلي)(\s|$)/.test(normalized);
  const personal = /(^|\s)(انا|عندي|لي|ليا|عليا|خاصتي|بتاعي|بتاعتي|حسابي|بياناتي|حضوري|غيابي)(\s|$)/.test(normalized);
  const studentName = extractStudentName(message);

  if (/(^|\s)(اكد|اكدها|اوافق|موافق|ايوه|اه|تمام|نفذ|نفذها|نعم|yes|confirm)(\s|$)/.test(normalized)) {
    return { intent: 'confirm', normalized };
  }
  if (/(^|\s)(الغ|الغي|الغاء|تراجع|مش|لا|لأ|رفض|cancel)(\s|$)/.test(normalized)) {
    return { intent: 'cancel', normalized };
  }
  if (studentName && !personal &&
      (scores.profile || scores.balance || scores.dues || scores.results)) {
    return {
      intent: 'studentLookup',
      normalized,
      imperative,
      personal,
      studentName,
      studentLookupMode: scores.results ? 'results' : scores.balance || scores.dues ? 'finance' : 'profile'
    };
  }
  if (scores.profile && !personal) {
    return { intent: 'studentLookup', normalized, imperative, personal, studentName: null };
  }
  if (scores.results) return { intent: 'results', normalized, imperative, personal };
  if (asksForCount && scores.exams) return { intent: 'examCount', normalized };
  if (asksForCount && scores.schedule) return { intent: 'sessionCount', normalized };
  if (asksForCount && /(طلاب|طالب|students)/.test(normalized)) return { intent: 'studentCount', normalized };
  if (scores.exams) return { intent: 'exams', normalized, imperative, personal };
  if (scores.report) return { intent: 'groupReport', normalized, imperative, personal };
  if (scores.dues && !personal) return { intent: 'dues', normalized, imperative, personal };
  if (scores.balance && personal) return { intent: 'balance', normalized, imperative, personal };
  if (asksForCount && scores.balance) return { intent: 'paymentsTotal', normalized };
  if (scores.attendance && scores.schedule) {
    return { intent: 'groupAttendance', normalized, imperative, personal };
  }

  function extractStudentName(message) {
    const tokens = String(message ?? '')
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .match(/[\p{L}\p{N}-]+/gu) || [];
    const retained = tokens.filter(token => {
      const normalized = normalizeArabic(token);
      return !studentQueryStopWords.has(normalized) &&
        !studentQueryStopWords.has(normalized.replace(/^ال/, ''));
    });
    if (!retained.length || retained.length > 6) return null;
    return retained.join(' ').trim();
  }
  if (scores.attendance) {
    if (personal && !imperative) return { intent: 'myAttendance', normalized, imperative, personal };
    return { intent: 'groupAttendance', normalized, imperative, personal };
  }
  if (personal && /(^|\s)(النهارده|النهاردا|اليوم|انهارده|انهاردا|بكره|غدا|غد)(\s|$)/.test(normalized)) {
    return { intent: 'schedule', normalized, imperative, personal };
  }
  if (scores.schedule) return { intent: 'schedule', normalized, imperative, personal };
  if (scores.balance) return { intent: 'balance', normalized, imperative, personal };
  if (scores.profile) return { intent: 'profile', normalized, imperative, personal };
  if (/(^|\s)(مرحبا|اهلا|السلام|صباح|مساء|hello|hi|hey)(\s|$)/.test(normalized)) {
    return { intent: 'greeting', normalized };
  }
  if (/(ساعدني|ماذا تستطيع|ايه اللي تقدر|تقدر تعمل|help|capabilities)/.test(normalized)) {
    return { intent: 'help', normalized };
  }
  if (/(شكرا|شكراً|متشكر|thanks|thank you)/.test(normalized)) {
    return { intent: 'thanks', normalized };
  }
  return { intent: 'unknown', normalized };
}

function cairoDateOffset(offset) {
  const [year, month, day] = today().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return date.toISOString().slice(0, 10);
}

function extractDate(normalized) {
  const explicit = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicit) {
    const value = `${explicit[1]}-${explicit[2]}-${explicit[3]}`;
    return Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  if (/(^|\s)(بكره|غدا|غد)(\s|$)/.test(normalized)) return cairoDateOffset(1);
  if (/(^|\s)(امبارح|مبارح|امس)(\s|$)/.test(normalized)) return cairoDateOffset(-1);
  if (/(^|\s)(النهارده|النهاردا|اليوم|انهارده|انهاردا|today)(\s|$)/.test(normalized)) return today();
  return null;
}

function groupMatches(normalized, groups) {
  const mentioned = groups.filter(group => {
    const name = normalizeArabic(group.name);
    return name && (` ${normalized} `).includes(` ${name} `);
  });
  if (mentioned.length) return mentioned;
  const ordinal = [
    ['اول', 'اوله', 'الاولي', 'first', '1'],
    ['ثاني', 'تاني', 'تانيه', 'الثانيه', 'second', '2'],
    ['ثالث', 'تالته', 'تالت', 'الثالثه', 'third', '3'],
    ['رابع', 'رابعه', 'الرابعه', 'fourth', '4']
  ].find(terms => terms.some(term => hasLexeme(normalized, term)));
  if (ordinal && /(مجموعه|جروب|دفعة|دفعه|الدفعة|الدفعب|فرقه|الفرقه|تقرير|حضور|طلاب)/.test(normalized)) {
    return groups.filter(group => {
      const name = normalizeArabic(group.name).split(' ').map(token => token.startsWith('ال') ? token.slice(2) : token);
      return ordinal.slice(0, 4).some(term => name.some(token => token.startsWith(normalizeArabic(term).replace(/^ال/, ''))));
    });
  }
  const number = normalized.match(/(?:مجموعه|جروب|group)\s*(\d+)/);
  if (!number) return [];
  const byId = groups.filter(group => String(group.id) === number[1]);
  if (byId.length) return byId;
  return groups.filter(group => normalizeArabic(group.name).split(' ').some(token => token === number[1]));
}

function money(amount) {
  return (Number(amount || 0) / 100).toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatTime(value) {
  if (!value) return 'موعد غير محدد';
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(Date.UTC(2020, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

async function activeStudent(db, userId) {
  const student = (await db.query(`SELECT s.id,s.user_id,s.name,s.code,s.level_id,s.group_id,
      s.course_price_snapshot price,s.active,s.cancelled_at,g.name group_name,l.name level_name
    FROM students s JOIN groups_table g ON g.id=s.group_id JOIN levels l ON l.id=s.level_id
    WHERE s.user_id=? AND s.active=1 AND s.cancelled_at IS NULL`, [userId])).rows[0];
  return student || null;
}

async function accessibleGroups(db, user) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    return student ? [{ id: student.group_id, name: student.group_name, level_id: student.level_id }] : [];
  }
  if (!STAFF_ROLES.has(user.role)) return [];
  return (await db.query(`SELECT g.id,g.name,g.level_id,l.name level_name
    FROM groups_table g JOIN levels l ON l.id=g.level_id ORDER BY l.id,g.id`, [])).rows;
}

function resolveGroup(normalized, groups, contextGroups = []) {
  const mentioned = groupMatches(normalized, groups);
  if (mentioned.length === 1) return { group: mentioned[0] };
  if (mentioned.length > 1) return { ambiguous: true, groups: mentioned };
  for (const message of contextGroups) {
    const contextual = groupMatches(normalizeArabic(message), groups);
    const unique = [...new Map(contextual.map(group => [group.id, group])).values()];
    if (unique.length) return unique.length === 1 ? { group: unique[0] } : { ambiguous: true, groups: unique };
  }
  return {};
}

function permissionMessage(role, intent) {
  const labels = {
    schedule: 'استعراض المحاضرات',
    attendance: 'استعراض الحضور',
    myAttendance: 'استعراض الحضور الشخصي',
    groupAttendance: 'استعراض حضور مجموعة',
    balance: 'استعراض الرصيد',
    dues: 'استعراض مستحقات الطلاب',
    exams: 'استعراض الامتحانات',
    results: 'استعراض النتائج والدرجات',
    groupReport: 'عرض تقرير المجموعة',
    profile: 'استعراض الملف الشخصي',
    studentLookup: 'استعراض بيانات طالب'
  };
  if ((intent === 'balance' || intent === 'myAttendance') && role !== 'student') {
    return 'وضح اسم الطالب أو المجموعة التي تريد الاستعلام عنها.';
  }
  return `دورك الحالي لا يملك صلاحية ${labels[intent] || 'تنفيذ هذا الطلب'} حسب صلاحيات النظام.`;
}

async function scheduleTool(db, user, date, upcoming = false) {
  const dateCondition = upcoming ? 'cs.date>=?' : 'cs.date=?';
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    const rows = (await db.query(`SELECT cs.id,cs.title,cs.date,cs.start_time,cs.end_time,
        g.name group_name,s.name subject_name,u.name doctor_name
      FROM course_sessions cs
      JOIN groups_table g ON g.id=cs.group_id
      LEFT JOIN subjects s ON s.id=cs.subject_id
      LEFT JOIN users u ON u.id=cs.doctor_id
      WHERE ${dateCondition} AND cs.cancelled=0 AND EXISTS(
        SELECT 1 FROM enrollments e WHERE e.student_id=? AND e.group_id=cs.group_id
          AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date))
      ORDER BY cs.start_time,cs.id`, [date, student.id])).rows;
    return { rows, date, upcoming };
  }
  if (!STAFF_ROLES.has(user.role)) return null;
  const doctorFilter = user.role === 'doctor' ? ' AND cs.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [date, user.id] : [date];
  const rows = (await db.query(`SELECT cs.id,cs.title,cs.date,cs.start_time,cs.end_time,
      g.name group_name,l.name level_name,s.name subject_name,u.name doctor_name
    FROM course_sessions cs JOIN groups_table g ON g.id=cs.group_id JOIN levels l ON l.id=g.level_id
    LEFT JOIN subjects s ON s.id=cs.subject_id LEFT JOIN users u ON u.id=cs.doctor_id
    WHERE ${dateCondition} AND cs.cancelled=0${doctorFilter}
    ORDER BY cs.start_time,l.name,g.name,cs.id LIMIT 100`, params)).rows;
  return { rows, date, upcoming };
}

async function ownAttendanceTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  const rows = (await db.query(`SELECT cs.date,cs.title,g.name group_name,cs.start_time,
      CASE WHEN a.id IS NULL THEN 'غائب' ELSE 'حاضر' END status
    FROM course_sessions cs JOIN groups_table g ON g.id=cs.group_id
    JOIN enrollments e ON e.student_id=? AND e.group_id=cs.group_id
      AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=?
    WHERE cs.cancelled=0 AND cs.date<=?
    ORDER BY cs.date DESC,cs.id DESC LIMIT 100`, [student.id, student.id, today()])).rows;
  const present = rows.filter(row => row.status === 'حاضر').length;
  return { rows, present, absent: rows.length - present, total: rows.length };
}

async function ownAttendanceOnDate(db, user, group, date) {
  const student = await activeStudent(db, user.id);
  if (!student || student.group_id !== group.id) return null;
  const rows = (await db.query(`SELECT cs.title,cs.start_time,a.id attendance_id
    FROM course_sessions cs JOIN enrollments e ON e.student_id=? AND e.group_id=cs.group_id
      AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=e.student_id
    WHERE cs.group_id=? AND cs.date=? AND cs.cancelled=0
    ORDER BY cs.start_time,cs.id`, [student.id, group.id, date])).rows;
  return rows;
}

async function groupAttendanceTool(db, group, date) {
  const sessions = (await db.query(`SELECT id,title,date,start_time FROM course_sessions
    WHERE group_id=? AND date=? AND cancelled=0 ORDER BY start_time,id`, [group.id, date])).rows;
  if (!sessions.length) return { sessions: [], group, date, students: [] };
  if (sessions.length > 1) return { sessions, group, date, ambiguous: true };
  const session = sessions[0];
  const students = (await db.query(`SELECT s.id,s.code,s.name,
      CASE WHEN a.id IS NULL THEN 'غائب' ELSE 'حاضر' END status
    FROM enrollments e JOIN students s ON s.id=e.student_id
    LEFT JOIN attendance a ON a.student_id=s.id AND a.session_id=?
    WHERE e.group_id=? AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)
      AND s.active=1 AND s.cancelled_at IS NULL
    ORDER BY s.name,s.id`, [session.id, group.id, date, date])).rows;
  return { sessions, session, group, date, students };
}

async function ownBalanceTool(db, user) {
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  const paid = Number((await db.query(`SELECT COALESCE(SUM(amount),0) total
    FROM payments WHERE student_id=? AND voided_at IS NULL`, [student.id])).rows[0].total || 0);
  return { price: Number(student.price || 0), paid, remaining: Math.max(0, Number(student.price || 0) - paid) };
}

async function duesTool(db, group) {
  const groupFilter = group ? ' AND s.group_id=?' : '';
  const params = group ? [group.id] : [];
  const rows = (await db.query(`SELECT s.name,s.code,g.name group_name,l.name level_name,
      s.course_price_snapshot price,COALESCE(p.paid,0) paid,
      GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0)) remaining
    FROM students s JOIN groups_table g ON g.id=s.group_id JOIN levels l ON l.id=s.level_id
    LEFT JOIN (SELECT student_id,SUM(amount) paid FROM payments WHERE voided_at IS NULL GROUP BY student_id) p
      ON p.student_id=s.id
    WHERE s.active=1 AND s.cancelled_at IS NULL
      AND GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0))>0${groupFilter}
    ORDER BY remaining DESC,s.name,s.id LIMIT 50`, params)).rows;
  return rows;
}

async function examsTool(db, user, date) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    const rows = (await db.query(`SELECT e.id,e.title,e.status,cl.lecture_date,s.name subject_name,
        cl.title lecture_title,u.name doctor_name
      FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
      JOIN subjects s ON s.id=e.subject_id JOIN users u ON u.id=e.doctor_id
      WHERE e.level_id=? AND e.status='published' AND cl.status<>'cancelled'
        AND cl.lecture_date>=? AND EXISTS(SELECT 1 FROM enrollments en
          WHERE en.student_id=? AND en.group_id=cl.group_id
            AND en.starts_on<=cl.lecture_date AND (en.ends_on IS NULL OR en.ends_on>cl.lecture_date))
      ORDER BY cl.lecture_date,e.id LIMIT 50`, [student.level_id, date, student.id])).rows;
    return rows;
  }
  const doctorFilter = user.role === 'doctor' ? ' AND e.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [date, user.id] : [date];
  const rows = (await db.query(`SELECT e.id,e.title,e.status,cl.lecture_date,s.name subject_name,
      cl.title lecture_title,u.name doctor_name
    FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
    JOIN subjects s ON s.id=e.subject_id JOIN users u ON u.id=e.doctor_id
    WHERE e.status='published' AND cl.status<>'cancelled' AND cl.lecture_date>=?${doctorFilter}
    ORDER BY cl.lecture_date,e.id LIMIT 50`, params)).rows;
  return rows;
}

async function resultsTool(db, user) {
  if (user.role === 'student') {
    const student = await activeStudent(db, user.id);
    if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
    return (await db.query(`SELECT e.title exam_title,s.name subject_name,a.score,a.total_questions,
        a.percentage,a.submitted_at
      FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN subjects s ON s.id=e.subject_id
      WHERE a.student_id=? AND a.status IN ('submitted','timed_out')
      ORDER BY a.submitted_at DESC,a.id DESC LIMIT 50`, [student.id])).rows;
  }
  if (!['doctor', 'assistant', 'admin'].includes(user.role)) return null;
  const doctorFilter = user.role === 'doctor' ? ' WHERE e.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [user.id] : [];
  return (await db.query(`SELECT e.title exam_title,s.name subject_name,cl.title lecture_title,
      st.name student_name,st.code,a.score,a.total_questions,a.percentage,a.submitted_at
    FROM exams e JOIN subjects s ON s.id=e.subject_id
    JOIN course_lectures cl ON cl.id=e.lecture_id
    JOIN exam_attempts a ON a.exam_id=e.id AND a.status IN ('submitted','timed_out')
    JOIN students st ON st.id=a.student_id
    ${doctorFilter} ORDER BY a.submitted_at DESC,a.id DESC LIMIT 100`, params)).rows;
}

async function profileTool(db, user) {
  if (user.role !== 'student') return null;
  const student = await activeStudent(db, user.id);
  if (!student) return { error: 'لم أجد ملف طالب نشطًا مرتبطًا بحسابك.' };
  return student;
}

async function findStudentsByName(db, name) {
  if (!name || name.length < 2) return [];
  const escaped = name.replace(/[!%_]/g, character => `!${character}`);
  return (await db.query(`SELECT s.id,s.name,s.code,
      s.course_price_snapshot price,l.name level_name,g.name group_name,
      COALESCE(p.paid,0) paid,
      GREATEST(0,s.course_price_snapshot-COALESCE(p.paid,0)) remaining,
      CASE WHEN s.cancelled_at IS NOT NULL THEN 'ملغي'
        WHEN COALESCE(p.paid,0)=0 THEN 'لم يدفع'
        WHEN COALESCE(p.paid,0)<s.course_price_snapshot THEN 'دفع جزئي'
        ELSE 'مدفوع بالكامل' END payment_status
    FROM students s JOIN levels l ON l.id=s.level_id JOIN groups_table g ON g.id=s.group_id
    LEFT JOIN (SELECT student_id,SUM(amount) paid FROM payments WHERE voided_at IS NULL GROUP BY student_id) p
      ON p.student_id=s.id
    WHERE s.active=1 AND s.cancelled_at IS NULL
      AND (s.name ILIKE ? ESCAPE '!' OR s.code ILIKE ? ESCAPE '!')
    ORDER BY s.name,s.id LIMIT 6`, [`%${escaped}%`, `%${escaped}%`])).rows;
}

async function studentResultsTool(db, user, studentId) {
  const doctorFilter = user.role === 'doctor' ? ' AND e.doctor_id=?' : '';
  const params = user.role === 'doctor' ? [studentId, user.id] : [studentId];
  return (await db.query(`SELECT e.title exam_title,s.name subject_name,a.score,a.total_questions,
      a.percentage,a.submitted_at
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN subjects s ON s.id=e.subject_id
    WHERE a.student_id=? AND a.status IN ('submitted','timed_out')${doctorFilter}
    ORDER BY a.submitted_at DESC,a.id DESC LIMIT 50`, params)).rows;
}

async function statsTool(db, intent) {
  const queries = {
    studentCount: 'SELECT COUNT(*) total FROM students WHERE active=1 AND cancelled_at IS NULL',
    paymentsTotal: 'SELECT COALESCE(SUM(amount),0) total FROM payments WHERE voided_at IS NULL',
    sessionCount: 'SELECT COUNT(*) total FROM course_sessions WHERE cancelled=0 AND date>=?',
    examCount: "SELECT COUNT(*) total FROM exams WHERE status<>'draft'"
  };
  const params = intent === 'sessionCount' ? [today()] : [];
  const result = await db.query(queries[intent], params);
  return Number(result.rows?.[0]?.total || 0);
}

function renderSchedule(result, date, upcoming) {
  if (result.error) return result.error;
  if (!result.rows.length) return upcoming
    ? `لا توجد محاضرات قادمة مسجلة ابتداءً من ${date}.`
    : `لا توجد محاضرات مسجلة بتاريخ ${date}.`;
  const items = result.rows.map(row =>
    `• ${row.title}${row.subject_name ? ` — ${row.subject_name}` : ''}، ${formatTime(row.start_time)}${row.group_name ? `، ${row.group_name}` : ''}${row.doctor_name ? `، د. ${row.doctor_name}` : ''}`
  );
  return `${upcoming ? `المحاضرات القادمة ابتداءً من ${date}` : `المحاضرات بتاريخ ${date}`}:\n${items.join('\n')}`;
}

function renderAttendance(result) {
  if (result.error) return result.error;
  if (!result.total) return 'لا توجد محاضرات مسجلة ضمن سجل حضورك حتى الآن.';
  return `سجل حضورك: حضرت ${result.present} من ${result.total} محاضرة، وغبت ${result.absent}.`;
}

function renderGroupAttendance(result) {
  if (!result.sessions.length) return `لم أجد محاضرة مسجلة للمجموعة ${result.group.name} بتاريخ ${result.date}.`;
  if (result.ambiguous) return `وجدت أكثر من محاضرة للمجموعة ${result.group.name} في هذا التاريخ. حدّد عنوان المحاضرة أو وقتها.`;
  if (!result.students.length) return `لم أجد طلابًا نشطين مسجلين في ${result.group.name} بتاريخ ${result.date}.`;
  const present = result.students.filter(student => student.status === 'حاضر');
  const absent = result.students.filter(student => student.status === 'غائب');
  const list = values => values.length
    ? values.map(student => `${student.name} (${student.code})`).join('، ')
    : 'لا يوجد';
  return `حضور ${result.group.name} — ${result.session.title} بتاريخ ${result.date}:\nحضر ${present.length}: ${list(present)}\nغاب ${absent.length}: ${list(absent)}`;
}

function renderDues(rows, group) {
  if (!rows.length) return `لا توجد مستحقات متبقية${group ? ` في ${group.name}` : ''} وفق البيانات الحالية.`;
  const total = rows.reduce((sum, row) => sum + Number(row.remaining || 0), 0);
  const details = rows.slice(0, 20).map(row => `• ${row.name} (${row.code}) — ${money(row.remaining)} جنيه${group ? '' : `، ${row.group_name}`}`);
  return `عدد الطلاب ذوي المبالغ المتبقية: ${rows.length}${rows.length === 50 ? ' على الأقل (عرض أول 50)' : ''}. مجموع المتبقي في القائمة المعروضة: ${money(total)} جنيه.\n${details.join('\n')}`;
}

function renderExams(rows) {
  if (rows.error) return rows.error;
  if (!rows.length) return 'لا توجد امتحانات منشورة قادمة مسجلة لحسابك.';
  return `الامتحانات القادمة:\n${rows.map(row =>
    `• ${row.title} — ${row.subject_name}، ${row.lecture_date}${row.doctor_name ? `، د. ${row.doctor_name}` : ''}`
  ).join('\n')}`;
}

function renderResults(rows, isStudent) {
  if (rows.error) return rows.error;
  if (!rows.length) return 'لا توجد نتائج امتحانات مكتملة متاحة في السجل.';
  return `نتائج الامتحانات:\n${rows.map(row =>
    `• ${isStudent ? row.subject_name + ' — ' : `${row.student_name} (${row.code}) — `}${row.exam_title}: ${row.score} من ${row.total_questions} (${Math.round(Number(row.percentage))}%)`
  ).join('\n')}`;
}

function renderReport(report, group) {
  const summary = report.summary;
  return `تقرير ${group.name} بتاريخ ${report.date}:\nالمحاضرات: ${summary.session_count}، المتوقع حضورهم: ${summary.scheduled}، الحاضرون: ${summary.present}، الغائبون: ${summary.absent}، الدفعات المسجلة: ${summary.payment_count} بإجمالي ${money(summary.payment_total * 100)} جنيه.`;
}

async function queueAttendanceConfirmation(db, user, group, date) {
  if (user.role !== 'assistant') return 'تسجيل الحضور متاح للأسستنت فقط وفق صلاحيات النظام الحالية.';
  if (date !== today()) return 'الأسستنت يستطيع تسجيل حضور اليوم فقط. لا أستطيع تسجيل أو تعديل حضور تاريخ آخر.';
  const settings = (await db.query('SELECT course_starts_at FROM course_settings WHERE id=1', [])).rows[0];
  if (!settings?.course_starts_at || Date.parse(settings.course_starts_at) > Date.now()) {
    return 'لم يبدأ الكورس بعد؛ تسجيل الحضور غير متاح حاليًا.';
  }
  const sessions = (await db.query(`SELECT id,title,start_time FROM course_sessions
    WHERE group_id=? AND date=? AND cancelled=0 ORDER BY start_time,id`, [group.id, date])).rows;
  if (!sessions.length) return `لا توجد محاضرة مسجلة اليوم للمجموعة ${group.name}. حدّد المحاضرة بعد تسجيلها في الجدول.`;
  if (sessions.length > 1) return `للمجموعة ${group.name} أكثر من محاضرة اليوم. اذكر عنوان المحاضرة أو وقتها.`;
  const session = sessions[0];
  const roster = (await db.query(`SELECT s.id FROM enrollments e JOIN students s ON s.id=e.student_id
    WHERE e.group_id=? AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)
      AND s.active=1 AND s.cancelled_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.student_id=s.id AND a.session_id=?)`,
  [group.id, date, date, session.id])).rows;
  if (!roster.length) return `لا يوجد طلاب غير مسجل حضورهم في ${group.name} لهذه المحاضرة.`;
  await db.query(`INSERT INTO ai_pending_actions(user_id,action,payload,expires_at)
    VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      action=EXCLUDED.action,payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at`,
  [user.id, 'record_group_attendance', JSON.stringify({
    group_id: group.id,
    group_name: group.name,
    session_id: session.id,
    session_title: session.title,
    date,
    student_ids: roster.map(student => student.id)
  }), Date.now() + ACTION_EXPIRY_MS]);
  return `سأعتبر الطلاب النشطين المسجلين وغير الموجود لهم سجل حضور في ${group.name} حاضرين في «${session.title}» اليوم (${roster.length} طالبًا). هذا إجراء جماعي يؤثر في سجلات الطلاب. أرسل «أكد» للتنفيذ أو «إلغاء» للتراجع.`;
}

async function confirmPendingAttendance(db, user) {
  const pending = (await db.query(`SELECT action,payload,expires_at FROM ai_pending_actions
    WHERE user_id=?`, [user.id])).rows[0];
  if (!pending || Number(pending.expires_at) <= Date.now()) {
    if (pending) await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return 'لا يوجد إجراء معلّق للتأكيد. اذكر المطلوب من جديد.';
  }
  if (pending.action !== 'record_group_attendance' || user.role !== 'assistant') {
    await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return 'تعذر تنفيذ هذا الإجراء وفق صلاحيات حسابك.';
  }
  const payload = JSON.parse(pending.payload);
  const settings = (await db.query('SELECT course_starts_at FROM course_settings WHERE id=1', [])).rows[0];
  if (payload.date !== today() || !settings?.course_starts_at || Date.parse(settings.course_starts_at) > Date.now()) {
    await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return 'انتهت صلاحية تأكيد الحضور أو لم يبدأ الكورس؛ لم يتم تعديل أي سجل.';
  }
  const result = await transaction(db, async () => {
    const session = (await db.query(`SELECT * FROM course_sessions
      WHERE id=? AND group_id=? AND date=? AND cancelled=0 FOR UPDATE`,
    [payload.session_id, payload.group_id, payload.date])).rows[0];
    if (!session || session.title !== payload.session_title) {
      throw Object.assign(new Error('تغيرت بيانات المحاضرة؛ لم يتم تسجيل الحضور.'), { status: 409 });
    }
    const students = (await db.query(`SELECT s.id,s.name,s.active,s.cancelled_at FROM enrollments e
      JOIN students s ON s.id=e.student_id
      WHERE e.group_id=? AND e.starts_on<=? AND (e.ends_on IS NULL OR e.ends_on>?)
        AND s.active=1 AND s.cancelled_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM attendance a WHERE a.student_id=s.id AND a.session_id=?)
      ORDER BY s.id FOR UPDATE OF s`,
    [payload.group_id, payload.date, payload.date, payload.session_id])).rows;
    const selectedIds = new Set(payload.student_ids.map(Number));
    const selectedStudents = students.filter(student => selectedIds.has(Number(student.id)));
    for (const student of selectedStudents) {
      await db.query('INSERT INTO attendance(student_id,session_id,recorded_by) VALUES(?,?,?)',
        [student.id, payload.session_id, user.id]);
      await audit(db, user, 'تسجيل حضور', 'student', student.id, {
        name: student.name, session_id: payload.session_id, date: payload.date, source: 'ai_chat'
      });
    }
    await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return selectedStudents.length;
  });
  return result
    ? `تم تسجيل حضور ${result} طالبًا في ${payload.group_name} — ${payload.session_title} بتاريخ ${payload.date}.`
    : `لم يتم تسجيل حضور جديد في ${payload.group_name}؛ قد تكون السجلات قد أضيفت بالفعل.`;
}

async function buildResponse(message, user, db, history) {
  const parsed = detectIntent(message);
  const previousTurns = history.slice(-8).reverse();
  const contextMessages = previousTurns.map(turn => turn.message);
  const previousRequest = previousTurns.map(turn => detectIntent(turn.message))
    .find(turn => turn.intent !== 'unknown' && turn.intent !== 'confirm' && turn.intent !== 'cancel');
  const previousIntent = previousRequest?.intent;
  const continuationDate = extractDate(parsed.normalized);
  if (parsed.intent === 'confirm') return confirmPendingAttendance(db, user);
  if (parsed.intent === 'cancel') {
    const deleted = await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
    return deleted.changes ? 'تم إلغاء الإجراء المعلّق، ولم يتم تعديل أي بيانات.' : 'لا يوجد إجراء معلّق لإلغائه.';
  }
  await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [user.id]);
  if (parsed.intent === 'unknown' && continuationDate && previousIntent === 'schedule') {
    parsed.intent = 'schedule';
  }
  if (parsed.intent === 'unknown' && previousIntent === 'groupAttendance' &&
      /(مين|من|اللي|غايب|غايبين|حضر|حاضرين|غياب)/.test(parsed.normalized)) {
    parsed.intent = 'groupAttendance';
  }
  if (parsed.intent === 'unknown' && previousIntent === 'groupReport' &&
      /(مجموعه|جروب|دفعة|دفعه|الدفعة|الدفعب|فرقه|الفرقه|اول|اوله|تاني|ثاني|ثالث|رابع|[0-9])/.
        test(parsed.normalized)) {
    parsed.intent = 'groupReport';
  }
  if (parsed.intent === 'unknown' && previousIntent === 'studentLookup') {
    parsed.intent = 'studentLookup';
    parsed.studentName = extractStudentName(message);
    parsed.studentLookupMode = previousRequest.studentLookupMode;
  }
  if (STAFF_ROLES.has(user.role) && previousIntent === 'studentLookup' &&
      previousRequest.studentName && ['balance', 'paymentsTotal', 'dues', 'results'].includes(parsed.intent) &&
      !parsed.studentName) {
    const followupMode = parsed.intent === 'results' ? 'results' : 'finance';
    parsed.intent = 'studentLookup';
    parsed.studentName = previousRequest.studentName;
    parsed.studentLookupMode = followupMode;
  }
  if (parsed.intent === 'unknown' && /(طب|طيب|وبكره|وبكره|وبعده|كمان|هناك)/.test(parsed.normalized) &&
      previousIntent && ['schedule', 'exams', 'groupReport', 'groupAttendance'].includes(previousIntent)) {
    parsed.intent = previousIntent;
  }
  const intent = parsed.intent;
  if (intent === 'greeting') return `أهلًا ${user.name}. أقدر أجيب بيانات النظام المتاحة لدورك، مثل جدولك أو حضورك أو تقارير المجموعة.`;
  if (intent === 'help') {
    const available = [...(READ_TOOLS[user.role] || [])].map(tool => ({
      schedule: 'المحاضرات والجداول',
      attendance: 'الحضور للمجموعات',
      balance: 'رصيدك الشخصي',
      dues: 'المستحقات',
      exams: 'الامتحانات القادمة',
      results: 'النتائج',
      groupReport: 'تقارير المجموعة',
      profile: 'بياناتك الشخصية',
      stats: 'إحصائيات الطلاب والمدفوعات والمحاضرات والامتحانات',
      studentLookup: 'بيانات الطلاب وحالة الدفع'
    })[tool]);
    return available.length
      ? `أستطيع جلب بيانات حقيقية من النظام عن: ${available.join('، ')}. أوامر تعديل البيانات تخضع للصلاحيات وتحتاج تأكيدًا.`
      : 'لا توجد أدوات بيانات متاحة لدور حسابك.';
  }
  if (intent === 'unknown') {
    return 'لم أتمكن من تحديد وظيفة مناسبة من بيانات الموقع لهذا الطلب. اذكر مثلًا المجال المطلوب (جدول، حضور، رصيد، امتحانات، درجات أو تقرير) وسأتحقق من صلاحيات حسابك والبيانات الفعلية.';
  }
  if (intent === 'thanks') return 'عفوًا، أنا هنا لمساعدتك.';

  const toolKey = ['studentCount', 'paymentsTotal', 'sessionCount', 'examCount'].includes(intent)
    ? 'stats'
    : intent === 'groupAttendance' || intent === 'myAttendance' ? 'attendance' : intent;
  if (!READ_TOOLS[user.role]?.has(toolKey)) {
    return permissionMessage(user.role, intent);
  }
  console.info('AI chat tool selected:', { role: user.role, tool: toolKey });

  if (['studentCount', 'paymentsTotal', 'sessionCount', 'examCount'].includes(intent)) {
    const value = await statsTool(db, intent);
    const responses = {
      studentCount: `عدد الطلاب النشطين حاليًا: ${value}.`,
      paymentsTotal: `إجمالي المدفوعات غير الملغاة: ${money(value)} جنيه.`,
      sessionCount: `عدد المحاضرات القادمة المسجلة: ${value}.`,
      examCount: `عدد الامتحانات المنشورة أو المغلقة: ${value}.`
    };
    return responses[intent];
  }
  if (intent === 'studentLookup') {
    if (!STAFF_ROLES.has(user.role)) return permissionMessage(user.role, intent);
    if (!parsed.studentName) return 'اذكر اسم الطالب أو كوده حتى أبحث في سجلات الطلاب.';
    const matches = await findStudentsByName(db, parsed.studentName);
    if (!matches.length) return `لم أجد طالبًا نشطًا يطابق «${parsed.studentName}». تحقق من كتابة الاسم أو أرسل كود الطالب.`;
    if (matches.length > 1) {
      return `وجدت أكثر من طالب يطابق الاسم. حدّد الطالب بالكود:\n${matches.map(student =>
        `• ${student.name} — ${student.code}، ${student.level_name}، ${student.group_name}`
      ).join('\n')}`;
    }
    const student = matches[0];
    if (parsed.studentLookupMode === 'results') {
      const rows = await studentResultsTool(db, user, student.id);
      return rows.length
        ? `نتائج ${student.name} (${student.code}):\n${rows.map(row =>
          `• ${row.subject_name} — ${row.exam_title}: ${row.score} من ${row.total_questions} (${Math.round(Number(row.percentage))}%)`
        ).join('\n')}`
        : `لا توجد نتائج مكتملة متاحة لـ${student.name} في نطاق صلاحيات حسابك.`;
    }
    return `بيانات ${student.name} (${student.code}): ${student.level_name}، ${student.group_name}.\nحالة الدفع: ${student.payment_status}. المدفوع ${money(student.paid)} جنيه، والمتبقي ${money(student.remaining)} جنيه.`;
  }

  const groupNames = await accessibleGroups(db, user);
  const date = extractDate(parsed.normalized) || today();
  const upcoming = lexicalScore(parsed.normalized, lexicons.upcoming) > 0;
  const groupResult = resolveGroup(parsed.normalized, groupNames, contextMessages);
  if (!groupResult.group && user.role === 'student' && groupNames.length === 1) {
    groupResult.group = groupNames[0];
  }
  if (groupResult.ambiguous) {
    return `أي مجموعة تقصد؟ ${groupResult.groups.map(group =>
      `${group.level_name ? `${group.level_name} — ` : ''}${group.name}`
    ).join('، ')}.`;
  }

  if (intent === 'schedule') {
    return renderSchedule(await scheduleTool(db, user, date, upcoming), date, upcoming);
  }
  if (intent === 'myAttendance') {
    if (user.role !== 'student') return permissionMessage(user.role, intent);
    return renderAttendance(await ownAttendanceTool(db, user));
  }
  if (intent === 'groupAttendance') {
    const writeRequested = parsed.imperative && /(سجل|اثبت|اضف|ضيف|علم)/.test(parsed.normalized);
    if (!groupResult.group) {
      return 'ما المجموعة المقصودة؟ اذكر اسمها، وإذا كنت تريد تسجيل الحضور فسيُطلب منك تأكيد نهائي قبل التنفيذ.';
    }
    if (writeRequested) {
      if (!STAFF_ROLES.has(user.role)) return 'تسجيل حضور الطلاب غير متاح لدور حسابك.';
      return queueAttendanceConfirmation(db, user, groupResult.group, date);
    }
    if (user.role === 'student') {
      const own = await activeStudent(db, user.id);
      if (!own || own.group_id !== groupResult.group.id) return permissionMessage(user.role, intent);
      const rows = await ownAttendanceOnDate(db, user, groupResult.group, date);
      if (!rows?.length) return `لا توجد محاضرة مسجلة لمجموعتك بتاريخ ${date}. أستطيع عرض حضورك فقط، وليس سجل بقية الطلاب.`;
      return `حضورك بتاريخ ${date}:\n${rows.map(row =>
        `• ${row.title} — ${row.attendance_id ? 'مسجل حاضر' : 'لا يوجد سجل حضور'}${row.start_time ? `، ${formatTime(row.start_time)}` : ''}`
      ).join('\n')}`;
    }
    const result = await groupAttendanceTool(db, groupResult.group, date);
    return renderGroupAttendance(result);
  }
  if (intent === 'balance') {
    if (user.role !== 'student') return permissionMessage(user.role, intent);
    const balance = await ownBalanceTool(db, user);
    return balance.error || `إجمالي المدفوع ${money(balance.paid)} جنيه، والمتبقي ${money(balance.remaining)} جنيه من إجمالي ${money(balance.price)} جنيه.`;
  }
  if (intent === 'dues') {
    const rows = await duesTool(db, groupResult.group || null);
    return renderDues(rows, groupResult.group || null);
  }
  if (intent === 'exams') {
    return renderExams(await examsTool(db, user, date));
  }
  if (intent === 'results') {
    return renderResults(await resultsTool(db, user), user.role === 'student');
  }
  if (intent === 'profile') {
    const profile = await profileTool(db, user);
    if (!profile) return permissionMessage(user.role, intent);
    return profile.error || `ملفك: ${profile.name} (${profile.code})، ${profile.level_name}، ${profile.group_name}.`;
  }
  if (intent === 'groupReport') {
    if (!groupResult.group) return 'أي مجموعة تقصد؟ اذكر اسم المجموعة لأجلب تقريرها من بيانات النظام.';
    const report = await dailyOperationsReport(db, { date, groupId: groupResult.group.id });
    return renderReport(report, groupResult.group);
  }
  return 'لم أتمكن من تنفيذ الطلب من خلال الأدوات المتاحة.';
}

export function registerAiAssistantRoutes(app, db) {
  const authenticated = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    next();
  };

  app.get('/api/ai/chat/history', authenticated, async (req, res) => {
    try {
      const result = await db.query(`SELECT id,user_id,user_name,user_role,message,response,created_at
        FROM ai_chat_messages WHERE user_id=? ORDER BY created_at ASC LIMIT 100`, [req.user.id]);
      res.json({ messages: result.rows || [] });
    } catch (error) {
      console.error('AI chat history read failed:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء جلب سجل المحادثة' });
    }
  });

  app.post('/api/ai/chat/message', authenticated, async (req, res) => {
    try {
      const { message } = req.body || {};
      if (typeof message !== 'string' || !message.trim() || message.trim().length > 2000) {
        return res.status(400).json({ error: 'اكتب رسالة من 1 إلى 2000 حرف' });
      }
      const user = { id: req.user.id, name: req.user.name, role: req.user.role };
      const previous = await db.query(`SELECT message,response FROM ai_chat_messages
        WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 8`, [user.id]);
      const history = (previous.rows || []).reverse();
      const intent = detectIntent(message);
      console.info('AI chat intent:', { role: user.role, intent: intent.intent });
      const response = await buildResponse(message.trim(), user, db, history);
      const saved = await db.query(`INSERT INTO ai_chat_messages
        (user_id,user_name,user_role,message,response,created_at)
        VALUES(?,?,?,?,?,?) RETURNING id,created_at`,
      [user.id, user.name, user.role, message.trim(), response, new Date().toISOString()]);
      res.json({
        id: saved.rows[0].id,
        message: message.trim(),
        response,
        created_at: saved.rows[0].created_at
      });
    } catch (error) {
      console.error('AI chat request failed:', { status: error.status || 500, error: error.name });
      res.status(error.status || 503).json({
        error: error.status && error.status < 500
          ? error.message
          : 'تعذر الوصول إلى بيانات المساعد الآن. لم يتم تأكيد تنفيذ أي عملية؛ حاول مرة أخرى.'
      });
    }
  });

  app.delete('/api/ai/chat/history', authenticated, async (req, res) => {
    try {
      await transaction(db, async () => {
        await db.query('DELETE FROM ai_chat_messages WHERE user_id=?', [req.user.id]);
        await db.query('DELETE FROM ai_pending_actions WHERE user_id=?', [req.user.id]);
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('AI chat history clear failed:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء مسح سجل المحادثة' });
    }
  });
}
