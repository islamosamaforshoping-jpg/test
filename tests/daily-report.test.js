import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyOperationsReport } from '../server/daily-report.js';

test('daily operations report summarizes scheduled attendance and non-voided payments', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('LEFT JOIN attendance')) {
        return { rows: [
          {
            session_id: 1, title: 'محاضرة 1', start_time: '2026-05-01T09:00:00Z',
            group_name: 'مجموعة أ', level_name: 'الفرقة الأولى', code: 'S1',
            student_name: 'طالب حاضر', attendance_id: 15, attendance_at: '2026-05-01T07:05:00Z'
          },
          {
            session_id: 1, title: 'محاضرة 1', start_time: '2026-05-01T09:00:00Z',
            group_name: 'مجموعة أ', level_name: 'الفرقة الأولى', code: 'S2',
            student_name: 'طالب غائب', attendance_id: null, attendance_at: null
          }
        ] };
      }
      if (sql.includes('FROM course_sessions cs') && !sql.includes('LEFT JOIN attendance')) {
        return { rows: [{ id: 1 }, { id: 2 }] };
      }
      if (sql.includes('FROM payments p')) {
        return { rows: [
          {
            amount: 1250, created_at: '2026-05-01T07:30:00Z', code: 'S1',
            student_name: 'طالب حاضر', level_name: 'الفرقة الأولى',
            group_name: 'مجموعة أ', recorded_by_name: 'دنيا'
          },
          {
            amount: 500, created_at: '2026-05-01T08:30:00Z', code: 'S2',
            student_name: 'طالب غائب', level_name: 'الفرقة الأولى',
            group_name: 'مجموعة أ', recorded_by_name: 'دنيا'
          }
        ] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  const report = await dailyOperationsReport(db, {
    date: '2026-05-01', levelId: 3, groupId: 8
  });

  assert.deepEqual(report.summary, {
    session_count: 2,
    scheduled: 2,
    present: 1,
    absent: 1,
    payment_count: 2,
    payment_total: 17.5
  });
  assert.deepEqual(report.sections[0].rows.map(row => row.at(-1)), ['حاضر', 'غائب']);
  assert.equal(report.sections[1].rows[0][5], 12.5);
  assert.deepEqual(queries.map(query => query.params), [
    ['2026-05-01', 3, 8],
    ['2026-05-01', 3, 8],
    ['2026-05-01', 3, 8]
  ]);
  assert.match(queries[2].sql, /p\.voided_at IS NULL/);
});
