CREATE TABLE certificates (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  level_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  issuer_name TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX certificates_student_issued
  ON certificates(student_id, issued_at DESC);
