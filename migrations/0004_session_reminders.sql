ALTER TABLE course_sessions ADD COLUMN starts_at_utc TEXT;
ALTER TABLE course_sessions ADD COLUMN reminder_sent_at TEXT;

CREATE INDEX sessions_reminder_due
  ON course_sessions(cancelled,reminder_sent_at,starts_at_utc);