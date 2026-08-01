-- sessions 表：记录每个账号最近一次签发的 JWT 过期时间，用于推算登录状态
CREATE TABLE IF NOT EXISTS sessions (
  user_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  exp INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(exp);
