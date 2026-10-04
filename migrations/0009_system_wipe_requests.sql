CREATE TABLE system_wipe_requests (
  id TEXT PRIMARY KEY,
  requester_id INTEGER NOT NULL,
  requester_name TEXT NOT NULL,
  requester_username TEXT NOT NULL,
  requester_role TEXT NOT NULL CHECK(requester_role IN ('admin','assistant')),
  approver_id INTEGER,
  approver_name TEXT,
  approver_username TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','processing','completed','failed','cancelled')),
  failure_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  approved_at TEXT,
  finished_at TEXT
);

CREATE INDEX system_wipe_requests_created
  ON system_wipe_requests(created_at DESC);
