const timeLabel = value => value
  ? new Date(value).toLocaleTimeString('ar-EG', {
    timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', hour12: true
  })
  : '—';

const moneyInPounds = cents => Number((Number(cents || 0) / 100).toFixed(2));

export async function dailyOperationsReport(db, { date, levelId = null, groupId = null }) {
  const filters = [], params = [date];
  if (levelId) {
    filters.push('g.level_id=?');
    params.push(levelId);
  }
  if (groupId) {
    filters.push('cs.group_id=?');
    params.push(groupId);
  }
  const filterSql = filters.length ? ` AND ${filters.join(' AND ')}` : '';

  const attendanceRows = (await db.query(`SELECT cs.id session_id,cs.title,cs.start_time,
      g.name group_name,l.name level_name,s.code,s.name student_name,a.id attendance_id,a.created_at attendance_at
    FROM course_sessions cs
    JOIN groups_table g ON g.id=cs.group_id
    JOIN levels l ON l.id=g.level_id
    JOIN enrollments e ON e.group_id=cs.group_id AND e.starts_on<=cs.date AND (e.ends_on IS NULL OR e.ends_on>cs.date)
    JOIN students s ON s.id=e.student_id AND s.active=1 AND s.cancelled_at IS NULL
    LEFT JOIN attendance a ON a.session_id=cs.id AND a.student_id=s.id
    WHERE cs.date=? AND cs.cancelled=0${filterSql}
    ORDER BY cs.start_time, l.name, g.name, s.name, s.id`, params)).rows;

  const sessionRows = (await db.query(`SELECT cs.id,cs.title,cs.start_time,g.name group_name,l.name level_name
    FROM course_sessions cs
    JOIN groups_table g ON g.id=cs.group_id
    JOIN levels l ON l.id=g.level_id
    WHERE cs.date=? AND cs.cancelled=0${filterSql}
    ORDER BY cs.start_time, l.name, g.name, cs.id`, params)).rows;

  const paymentFilters = [], paymentParams = [date];
  if (levelId) {
    paymentFilters.push('s.level_id=?');
    paymentParams.push(levelId);
  }
  if (groupId) {
    paymentFilters.push('s.group_id=?');
    paymentParams.push(groupId);
  }
  const paymentFilterSql = paymentFilters.length ? ` AND ${paymentFilters.join(' AND ')}` : '';
  const payments = (await db.query(`SELECT p.amount,p.created_at,s.code,s.name student_name,
      l.name level_name,g.name group_name,u.name recorded_by_name
    FROM payments p
    JOIN students s ON s.id=p.student_id
    JOIN levels l ON l.id=s.level_id
    JOIN groups_table g ON g.id=s.group_id
    JOIN users u ON u.id=p.recorded_by
    WHERE p.voided_at IS NULL
      AND (p.created_at::timestamptz AT TIME ZONE 'Africa/Cairo')::date=?${paymentFilterSql}
    ORDER BY p.created_at,p.id`, paymentParams)).rows;

  const present = attendanceRows.filter(row => row.attendance_id).length;
  const absent = attendanceRows.length - present;
  const paymentTotal = payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);

  return {
    title: 'التقرير اليومي للمساعد',
    date,
    summary: {
      session_count: sessionRows.length,
      scheduled: attendanceRows.length,
      present,
      absent,
      payment_count: payments.length,
      payment_total: moneyInPounds(paymentTotal)
    },
    sections: [
      {
        title: 'الحضور والغياب',
        headings: ['الوقت', 'الفرقة', 'المجموعة', 'المحاضرة', 'كود الطالب', 'اسم الطالب', 'الحالة'],
        rows: attendanceRows.map(row => [
          timeLabel(row.attendance_at || row.start_time),
          row.level_name,
          row.group_name,
          row.title,
          row.code,
          row.student_name,
          row.attendance_id ? 'حاضر' : 'غائب'
        ])
      },
      {
        title: 'المدفوعات',
        headings: ['الوقت', 'الفرقة', 'المجموعة', 'كود الطالب', 'اسم الطالب', 'المبلغ بالجنيه', 'سجلها'],
        rows: payments.map(payment => [
          timeLabel(payment.created_at),
          payment.level_name,
          payment.group_name,
          payment.code,
          payment.student_name,
          moneyInPounds(payment.amount),
          payment.recorded_by_name
        ])
      }
    ],
    note: 'الحضور والغياب محسوبان للطلاب النشطين المسجلين في مجموعاتهم بتاريخ التقرير. المدفوعات الملغاة غير محتسبة.'
  };
}
