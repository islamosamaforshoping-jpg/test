CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  user_name TEXT NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_user ON ai_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_created ON ai_chat_messages(created_at);
