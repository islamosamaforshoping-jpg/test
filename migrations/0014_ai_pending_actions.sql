CREATE TABLE ai_pending_actions (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
