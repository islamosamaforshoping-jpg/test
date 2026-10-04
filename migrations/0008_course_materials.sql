CREATE TABLE course_materials (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  level_id INTEGER NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 160),
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL CHECK(length(trim(file_name)) BETWEEN 1 AND 240),
  content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png')),
  file_size INTEGER NOT NULL CHECK(file_size BETWEEN 1 AND 20971520),
  storage_key TEXT NOT NULL UNIQUE,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX course_materials_level_subject
  ON course_materials(level_id,subject_id,created_at DESC,id DESC);
