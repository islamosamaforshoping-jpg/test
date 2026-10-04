ALTER TABLE students ADD COLUMN course_price_snapshot INTEGER NOT NULL DEFAULT 0 CHECK(course_price_snapshot>=0);
UPDATE students SET course_price_snapshot=price;
ALTER TABLE students ADD COLUMN cancelled_at TEXT;

CREATE TABLE course_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  booking_open INTEGER NOT NULL DEFAULT 1 CHECK(booking_open IN (0,1)),
  booking_starts_at TEXT,
  booking_ends_at TEXT,
  course_starts_at TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO course_settings(id,booking_open) VALUES(1,1);

CREATE TABLE level_course_prices (
  level_id INTEGER PRIMARY KEY REFERENCES levels(id) ON DELETE CASCADE,
  price INTEGER NOT NULL DEFAULT 0 CHECK(price>=0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO level_course_prices(level_id,price)
  SELECT id,(SELECT price FROM courses WHERE id=1) FROM levels;

CREATE INDEX students_booking ON students(active,cancelled_at,level_id,group_id);
CREATE INDEX level_prices_updated ON level_course_prices(updated_at);