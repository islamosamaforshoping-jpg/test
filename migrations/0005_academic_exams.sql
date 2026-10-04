CREATE TABLE subjects (
  id INTEGER PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id INTEGER NOT NULL REFERENCES levels(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(doctor_id,level_id,name),
  UNIQUE(id,doctor_id,level_id)
);

CREATE TABLE course_lectures (
  id INTEGER PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL,
  level_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  course_session_id INTEGER NOT NULL REFERENCES course_sessions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  topic TEXT NOT NULL DEFAULT '',
  lecture_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','started','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(subject_id,doctor_id,level_id) REFERENCES subjects(id,doctor_id,level_id) ON DELETE CASCADE,
  FOREIGN KEY(group_id,level_id) REFERENCES groups_table(id,level_id),
  UNIQUE(id,doctor_id,subject_id,level_id)
);

CREATE INDEX course_lectures_owner_date ON course_lectures(doctor_id,lecture_date DESC,id DESC);
CREATE INDEX course_lectures_student_schedule ON course_lectures(level_id,group_id,lecture_date DESC);

CREATE TABLE exams (
  id INTEGER PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  level_id INTEGER NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 600),
  question_count INTEGER NOT NULL CHECK(question_count BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
  share_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(lecture_id,doctor_id,subject_id,level_id)
    REFERENCES course_lectures(id,doctor_id,subject_id,level_id) ON DELETE CASCADE,
  UNIQUE(id,doctor_id)
);

CREATE INDEX exams_owner_status ON exams(doctor_id,status,updated_at DESC);
CREATE INDEX exams_student_eligibility ON exams(level_id,status,updated_at DESC);

CREATE TABLE exam_questions (
  id INTEGER PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL CHECK(length(trim(question_text)) BETWEEN 1 AND 4000),
  question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice','true_false')),
  options_json TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,exam_id)
);

CREATE INDEX exam_questions_pool ON exam_questions(exam_id,sort_order,id);

CREATE TABLE exam_attempts (
  id INTEGER PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds>=0),
  score INTEGER NOT NULL DEFAULT 0 CHECK(score>=0),
  percentage REAL NOT NULL DEFAULT 0 CHECK(percentage BETWEEN 0 AND 100),
  correct_answers INTEGER NOT NULL DEFAULT 0 CHECK(correct_answers>=0),
  wrong_answers INTEGER NOT NULL DEFAULT 0 CHECK(wrong_answers>=0),
  total_questions INTEGER NOT NULL CHECK(total_questions>0),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','timed_out')),
  integrity_risk_score INTEGER NOT NULL DEFAULT 0 CHECK(integrity_risk_score>=0),
  UNIQUE(exam_id,student_id),
  UNIQUE(id,exam_id)
);

CREATE INDEX exam_attempts_student ON exam_attempts(student_id,started_at DESC);
CREATE INDEX exam_attempts_exam_results ON exam_attempts(exam_id,status,submitted_at DESC,id DESC);

CREATE TABLE exam_attempt_questions (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL,
  exam_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position>=0),
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice','true_false')),
  options_json TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  UNIQUE(attempt_id,position),
  UNIQUE(attempt_id,question_id),
  FOREIGN KEY(attempt_id,exam_id) REFERENCES exam_attempts(id,exam_id) ON DELETE CASCADE,
  FOREIGN KEY(question_id,exam_id) REFERENCES exam_questions(id,exam_id) ON DELETE RESTRICT
);

CREATE TABLE exam_answers (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  selected_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK(is_correct IN (0,1)),
  answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(attempt_id,question_id),
  FOREIGN KEY(attempt_id,question_id) REFERENCES exam_attempt_questions(attempt_id,question_id) ON DELETE CASCADE
);

CREATE TABLE exam_integrity_events (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('TAB_HIDDEN','TAB_VISIBLE','PAGE_BLUR','PAGE_FOCUS','PAGE_HIDE','PAGE_SHOW')),
  occurred_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds>=0),
  question_id INTEGER REFERENCES exam_questions(id) ON DELETE SET NULL
);

CREATE INDEX exam_integrity_attempt_time ON exam_integrity_events(attempt_id,occurred_at,id);