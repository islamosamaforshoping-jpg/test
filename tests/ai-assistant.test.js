import assert from 'node:assert/strict';
import test from 'node:test';
import { detectIntent, registerAiAssistantRoutes } from '../server/ai-assistant.js';
import { today } from '../server/db.js';

const cases = [
  ['عندي محاضرات إيه النهارده؟', 'schedule'],
  ['إيه جدول اليوم؟', 'schedule'],
  ['المحاضرات بتاعتي إيه؟', 'schedule'],
  ['اعرض المحاضرات القادمة', 'schedule'],
  ['محاظراتي انهارده', 'schedule'],
  ['مين حضر النهارده؟', 'groupAttendance'],
  ['عاوز أعرف مين غاب', 'groupAttendance'],
  ['أنا غبت كام مرة؟', 'myAttendance'],
  ['حضوري نسبته كام؟', 'myAttendance'],
  ['مين لسه مدفعش؟', 'dues'],
  ['هات الطلاب اللي عليهم فلوس', 'dues'],
  ['عليا كام؟', 'balance'],
  ['فاضل عليا كام؟', 'balance'],
  ['أنا دفعت كام؟', 'balance'],
  ['سجّل حضور المجموعة', 'groupAttendance'],
  ['اعرض درجات الطلاب', 'results'],
  ['عدد الطلاب النشطين كام؟', 'studentCount'],
  ['إجمالي المدفوعات كام؟', 'paymentsTotal'],
  ['عدد المحاضرات القادمة', 'sessionCount'],
  ['كم اختبار منشور؟', 'examCount'],
  ['عندي امتحانات إمتى؟', 'exams'],
  ['هات تقرير المجموعة', 'groupReport'],
  ['بيانات اسلام اسامه', 'studentLookup'],
  ['هل اسلام دفع فلوس الكورس؟', 'studentLookup'],
  ['بياناتي', 'profile'],
  ['أكّد', 'confirm'],
  ['إلغاء', 'cancel']
];

for (const [message, expected] of cases) {
  test(`classifies ${message} as ${expected}`, () => {
    assert.equal(detectIntent(message).intent, expected);
  });
}

test('does not map unrelated questions to a site-data tool', () => {
  assert.equal(detectIntent('إيه أفضل مطعم في إيطاليا؟').intent, 'unknown');
});

test('returns write intent metadata for an attendance command', () => {
  const parsed = detectIntent('سجل حضور مجموعة النخيل');
  assert.equal(parsed.intent, 'groupAttendance');
  assert.equal(parsed.imperative, true);
});

test('extracts a named student from profile and payment questions', () => {
  assert.equal(detectIntent('بيانات اسلام اسامه').studentName, 'اسلام اسامه');
  const payment = detectIntent('هل اسلام دفع فلوس الكورس؟');
  assert.equal(payment.intent, 'studentLookup');
  assert.equal(payment.studentName, 'اسلام');
  assert.equal(payment.studentLookupMode, 'finance');
});

function routeHarness(db) {
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post', 'delete'].map(method => [
    method,
    (path, ...handlers) => routes.set(`${method} ${path}`, handlers)
  ]));
  registerAiAssistantRoutes(app, db);
  return async (method, path, req) => {
    const handlers = routes.get(`${method} ${path}`);
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    const next = index => {
      if (index >= handlers.length) return Promise.resolve();
      let following;
      const result = handlers[index](req, res, () => {
        following = next(index + 1);
        return following;
      });
      return Promise.resolve(result).then(() => following);
    };
    await next(0);
    return res;
  };
}

test('student balance uses only their authenticated student record and payment rows', async () => {
  const seen = [];
  const db = {
    async query(sql, params = []) {
      seen.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب تجريبي', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2,
          level_name: 'الفرقة الثانية', price: 120000
        }] };
      }
      if (sql.includes('FROM payments WHERE student_id=?')) return { rows: [{ total: 80000 }] };
      if (sql.includes('INSERT INTO ai_chat_messages')) {
        return { rows: [{ id: 1, created_at: '2026-10-04T18:00:00Z' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب تجريبي', role: 'student' },
    body: { message: 'فاضل عليا كام؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /متبقي/);
  assert.ok(seen.some(query => query.sql.includes('FROM payments WHERE student_id=?') &&
    query.params[0] === 27));
});

test('assistant can access student results through AI', async () => {
  const seen = [];
  const db = {
    async query(sql, params = []) {
      seen.push(sql);
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM exams e JOIN subjects s')) {
        assert.doesNotMatch(sql, /WHERE e\.doctor_id/);
        assert.deepEqual(params, []);
        return { rows: [{
          exam_title: 'اختبار عام', subject_name: 'رياضيات',
          student_name: 'طالب', code: 'S1', score: 18, total_questions: 20, percentage: 90
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 2, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 9, name: 'مساعدة', role: 'assistant' },
    body: { message: 'اعرض درجات الطلاب' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /اختبار عام/);
  assert.ok(seen.some(sql => sql.includes('JOIN exam_attempts a')));
});

test('staff can look up a named student and get actual payment totals', async () => {
    const seen = [];
    const db = {
      async query(sql, params = []) {
        seen.push({ sql, params });
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('FROM students s JOIN levels l')) {
          assert.match(sql, /s\.name ILIKE/);
          assert.deepEqual(params, ['%اسلام اسامه%', '%اسلام اسامه%']);
          return { rows: [{
            id: 7, name: 'اسلام اسامه', code: 'ST7', level_name: 'الفرقة الأولى',
            group_name: 'المجموعة الأولى', price: 120000, paid: 80000, remaining: 40000,
            payment_status: 'دفع جزئي'
          }] };
        }
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 8, created_at: '2026-10-04T18:00:00Z' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 9, name: 'مساعدة', role: 'assistant' },
      body: { message: 'بيانات اسلام اسامه' }
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body.response, /اسلام اسامه/);
  assert.match(response.body.response, /٨٠٠/);
  assert.match(response.body.response, /٤٠٠/);
  assert.ok(seen.some(query => query.sql.includes('FROM payments WHERE voided_at IS NULL')));
});

test('a payment question about a named student uses the finance lookup', async () => {
    let searchedName = null;
    const db = {
      async query(sql, params = []) {
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('FROM students s JOIN levels l')) {
          searchedName = params[0];
          return { rows: [{
            id: 12, name: 'اسلام', code: 'ST12', level_name: 'الفرقة الأولى',
            group_name: 'المجموعة الأولى', price: 120000, paid: 80000, remaining: 40000,
            payment_status: 'دفع جزئي'
          }] };
        }
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 9, created_at: '2026-10-04T18:00:00Z' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 9, name: 'دنيا', role: 'assistant' },
      body: { message: 'هل اسلام دفع فلوس الكورس؟' }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(searchedName, '%اسلام%');
    assert.match(response.body.response, /دفع جزئي/);
});

test('a finance follow-up reuses the previous named student', async () => {
  let searchedName = null;
  const db = {
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'بيانات اسلام اسامه', response: 'بيانات الطالب...' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN levels l')) {
        searchedName = params[0];
        return { rows: [{
          id: 12, name: 'اسلام اسامه', code: 'ST12', level_name: 'الفرقة الأولى',
          group_name: 'المجموعة الأولى', price: 120000, paid: 80000, remaining: 40000,
          payment_status: 'دفع جزئي'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 11, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 9, name: 'دنيا', role: 'assistant' },
    body: { message: 'طيب دفع كام؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(searchedName, '%اسلام اسامه%');
  assert.match(response.body.response, /المدفوع ٨٠٠/);
});

test('ordinal group aliases resolve reports against the actual group id', async () => {
    const reportFilters = [];
    const db = {
      async query(sql, params = []) {
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('FROM groups_table g JOIN levels')) {
          return { rows: [
            { id: 3, name: 'المجموعة الأولى', level_id: 1, level_name: 'الفرقة الأولى' },
            { id: 4, name: 'المجموعة الثانية', level_id: 1, level_name: 'الفرقة الأولى' }
          ] };
        }
        if (sql.includes('FROM course_sessions cs')) {
          reportFilters.push({ sql, params });
          return { rows: [] };
        }
        if (sql.includes('FROM payments p')) return { rows: [] };
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 10, created_at: '2026-10-04T18:00:00Z' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 9, name: 'مساعدة', role: 'assistant' },
      body: { message: 'تقرير دفعة الاوله' }
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body.response, /تقرير المجموعة الأولى/);
    assert.equal(reportFilters.length, 2);
    assert.ok(reportFilters.every(({ sql, params }) => sql.includes('cs.group_id=?') && params[1] === 3));
});

test('group attendance requires explicit confirmation before writing records', async () => {
  let pending = null;
  const writes = [];
  const db = {
    pool: {
      async connect() {
        return {
          async query() {},
          release() {}
        };
      }
    },
    async query(sql, params = []) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('FROM groups_table g JOIN levels')) {
        return { rows: [{ id: 8, name: 'مجموعة النخيل', level_id: 2 }] };
      }
      if (sql.includes('SELECT course_starts_at FROM course_settings')) {
        return { rows: [{ course_starts_at: '2020-01-01T00:00:00Z' }] };
      }
      if (sql.includes('FROM course_sessions') && sql.includes('ORDER BY start_time,id')) {
        return { rows: [{ id: 3, title: 'محاضرة الحساب', start_time: '17:00' }] };
      }
      if (sql.includes('SELECT s.id FROM enrollments e JOIN students s')) {
        return { rows: [{ id: 10 }, { id: 11 }] };
      }
      if (sql.includes('INSERT INTO ai_pending_actions')) {
        pending = { action: params[1], payload: params[2], expires_at: params[3] };
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 3, created_at: '2026-10-04T18:00:00Z' }] };
      if (sql.includes('FROM ai_pending_actions')) return { rows: pending ? [pending] : [] };
      if (sql.includes('WHERE id=? AND group_id=? AND date=? AND cancelled=0 FOR UPDATE')) {
        return { rows: [{
          id: 3, group_id: 8, date: params[2], title: 'محاضرة الحساب', cancelled: 0
        }] };
      }
      if (sql.includes('SELECT s.id,s.name,s.active,s.cancelled_at FROM enrollments')) {
        return { rows: [{ id: 10, name: 'الأول' }, { id: 11, name: 'الثاني' }] };
      }
      if (sql.includes('INSERT INTO attendance')) {
        writes.push({ sql, params });
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO audit_logs')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) {
        pending = null;
        return { changes: 1, rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const user = { id: 51, name: 'دنيا', role: 'assistant' };
  const first = await request('post', '/api/ai/chat/message', {
    user,
    body: { message: 'سجل حضور مجموعة النخيل' }
  });
  assert.equal(first.statusCode, 200);
  assert.match(first.body.response, /أرسل «أكد»/);
  assert.equal(writes.length, 0);

  const confirmed = await request('post', '/api/ai/chat/message', {
    user,
    body: { message: 'أكد' }
  });
  assert.equal(confirmed.statusCode, 200);
  assert.match(confirmed.body.response, /تم تسجيل حضور 2 طالبًا/);
  assert.equal(writes.length, 2);
});

test('a short follow-up date reuses the previous schedule intent', async () => {
  const calls = [];
  const [year, month, day] = today().split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) {
        return { rows: [{ message: 'عندي محاضرات النهارده؟', response: '...' }] };
      }
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) return { rows: [] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 4, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'طب بكرة؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.ok(calls.some(query => query.sql.includes('WHERE cs.date=?') &&
    query.params[0] === tomorrow));
});

test('upcoming lecture questions query dates from today onward', async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && sql.includes('EXISTS')) {
        return { rows: [{ title: 'محاضرة قادمة', date: today(), start_time: '17:00' }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 6, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'اعرض المحاضرات القادمة' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /المحاضرات القادمة/);
  assert.ok(calls.some(query => query.sql.includes('WHERE cs.date>=?') &&
    query.params[0] === today()));
});

test('student group-attendance questions return only that student’s own status', async () => {
  const seen = [];
  const db = {
    async query(sql, params = []) {
      seen.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM course_sessions cs JOIN enrollments e')) {
        return { rows: [{ title: 'محاضرة الحساب', start_time: '17:00', attendance_id: 10 }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 5, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'مين حضر النهارده؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /حضورك بتاريخ/);
  assert.equal(seen.some(query => query.sql.includes('FROM enrollments e JOIN students s')), false);
});

test('staff dues queries return real unpaid amounts and remain staff-only', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM students s JOIN groups_table g')) {
        return { rows: [{
          name: 'طالب عليه مستحق', code: 'S17', group_name: 'مجموعة النخيل',
          price: 120000, paid: 80000, remaining: 40000
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 7, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'هات الطلاب اللي عليهم فلوس' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /طالب عليه مستحق/);
  assert.match(response.body.response, /٤٠٠/);
  assert.ok(statements.some(query => query.sql.includes('FROM payments WHERE voided_at IS NULL')));
});

test('doctor results are scoped to the authenticated doctor’s exams', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM exams e JOIN subjects s')) {
        return { rows: [{
          exam_title: 'اختبار الحساب', subject_name: 'حساب',
          student_name: 'طالب أول', code: 'S1', score: 18,
          total_questions: 20, percentage: 90
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 8, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 77, name: 'دكتور', role: 'doctor' },
    body: { message: 'اعرض درجات الطلاب' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /اختبار الحساب/);
  assert.ok(statements.some(query => query.sql.includes('WHERE e.doctor_id=?') &&
    query.params[0] === 77));
});

test('assistant upcoming exams are not restricted to an individual doctor', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) return { rows: [] };
      if (sql.includes('FROM exams e JOIN course_lectures')) {
        return { rows: [{
          title: 'امتحان منشور', subject_name: 'علوم',
          lecture_date: '2026-10-05', lecture_title: 'محاضرة', doctor_name: 'دكتور'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 14, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'عندنا امتحانات إمتى؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /امتحان منشور/);
  const examQuery = statements.find(query => query.sql.includes('FROM exams e JOIN course_lectures'));
  assert.ok(examQuery);
  assert.doesNotMatch(examQuery.sql, /WHERE[\s\S]*e\.doctor_id/);
  assert.deepEqual(examQuery.params, [today()]);
  assert.match(examQuery.sql, /e\.status='published'/);
});

test('student upcoming exams are filtered by their level, enrollment, and date', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('FROM exams e JOIN course_lectures')) {
        return { rows: [{
          title: 'امتحان قادم', subject_name: 'حساب', lecture_date: '2026-10-05',
          lecture_title: 'محاضرة قادمة', doctor_name: 'دكتور'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 9, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'عندي امتحانات إمتى؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /امتحان قادم/);
  assert.ok(statements.some(query => query.sql.includes('en.student_id=?') &&
    query.params[0] === 2 && query.params[2] === 27));
});

test('group report delegates to the existing daily operations report function', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) {
        return { rows: [{ id: 8, name: 'مجموعة النخيل', level_id: 2, level_name: 'الثانية' }] };
      }
      if (sql.includes('LEFT JOIN attendance')) {
        return { rows: [{
          session_id: 3, title: 'محاضرة', start_time: '17:00',
          group_name: 'مجموعة النخيل', level_name: 'الثانية',
          code: 'S1', student_name: 'طالب', attendance_id: 10
        }] };
      }
      if (sql.includes('FROM course_sessions cs') && !sql.includes('LEFT JOIN attendance')) {
        return { rows: [{ id: 3, title: 'محاضرة', start_time: '17:00' }] };
      }
      if (sql.includes('FROM payments p')) return { rows: [] };
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 10, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'هات تقرير مجموعة النخيل' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /الحاضرون: 1/);
  assert.equal(statements.filter(query => query.sql.includes('FROM payments p')).length, 1);
});

test('staff group attendance returns the current session roster and actual statuses', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM groups_table g JOIN levels')) {
        return { rows: [{ id: 8, name: 'مجموعة النخيل', level_id: 2 }] };
      }
      if (sql.includes('FROM course_sessions') && sql.includes('WHERE group_id=? AND date=?')) {
        return { rows: [{ id: 3, title: 'محاضرة الحساب', date: today(), start_time: '17:00' }] };
      }
      if (sql.includes('SELECT s.id,s.code,s.name')) {
        return { rows: [
          { name: 'حضر', code: 'S1', status: 'حاضر' },
          { name: 'غاب', code: 'S2', status: 'غائب' }
        ] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 11, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 52, name: 'مساعدة', role: 'assistant' },
    body: { message: 'مين حضر النهارده في مجموعة النخيل؟' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /حضر 1/);
  assert.match(response.body.response, /غاب 1/);
  assert.match(response.body.response, /حضر \(S1\)/);
  assert.match(response.body.response, /غاب \(S2\)/);
});

test('staff aggregate intents use their matching data queries', async () => {
  const cases = [
    ['عدد الطلاب كام؟', 'studentCount', /عدد الطلاب النشطين/],
    ['إجمالي المدفوعات', 'paymentsTotal', /إجمالي المدفوعات/],
    ['عدد المحاضرات القادمة', 'sessionCount', /عدد المحاضرات القادمة/],
    ['كم اختبار منشور؟', 'examCount', /عدد الامتحانات المنشورة/]
  ];
  for (const [message, table, responsePattern] of cases) {
    let aggregateQuery = '';
    const db = {
      async query(sql) {
        if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
        if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
        if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 12, created_at: '2026-10-04T18:00:00Z' }] };
        aggregateQuery = sql;
        return { rows: [{ total: table === 'paymentsTotal' ? 83000 : 14 }] };
      }
    };
    const request = routeHarness(db);
    const response = await request('post', '/api/ai/chat/message', {
      user: { id: 52, name: 'مساعدة', role: 'assistant' },
      body: { message }
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body.response, responsePattern);
    assert.ok(aggregateQuery.includes({
      studentCount: 'FROM students',
      paymentsTotal: 'FROM payments',
      sessionCount: 'FROM course_sessions',
      examCount: 'FROM exams'
    }[table]));
  }
});

test('student profile data is selected by the authenticated user id', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT message,response FROM ai_chat_messages')) return { rows: [] };
      if (sql.includes('DELETE FROM ai_pending_actions')) return { rows: [], changes: 0 };
      if (sql.includes('FROM students s JOIN groups_table')) {
        return { rows: [{
          id: 27, user_id: 41, name: 'طالب', code: 'ST27',
          group_id: 8, group_name: 'مجموعة النخيل', level_id: 2, level_name: 'الفرقة الثانية'
        }] };
      }
      if (sql.includes('INSERT INTO ai_chat_messages')) return { rows: [{ id: 13, created_at: '2026-10-04T18:00:00Z' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const request = routeHarness(db);
  const response = await request('post', '/api/ai/chat/message', {
    user: { id: 41, name: 'طالب', role: 'student' },
    body: { message: 'بياناتي' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.response, /طالب \(ST27\)/);
  assert.ok(statements.some(query => query.sql.includes('WHERE s.user_id=?') &&
    query.params[0] === 41));
});
