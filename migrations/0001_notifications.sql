CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('PAYMENT_REMINDER','ATTENDANCE_WARNING','GENERAL','SYSTEM')),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  CHECK((is_read=0 AND read_at IS NULL) OR (is_read=1 AND read_at IS NOT NULL))
);

CREATE INDEX notifications_student_unread
  ON notifications(student_id,is_read,created_at DESC);
CREATE INDEX notifications_type_latest
  ON notifications(student_id,type,created_at DESC);