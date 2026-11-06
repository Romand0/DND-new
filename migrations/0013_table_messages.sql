-- table_messages 表：圆桌消息信箱（首批类型 check_request / check_result）
-- 消息不可变：仅 check_request 的 status / reply_message_id / updated_at 可回填
CREATE TABLE IF NOT EXISTS table_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reply_message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_table_messages_inbox
  ON table_messages(to_user_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_table_messages_outbox
  ON table_messages(from_user_id, created_at, id);
