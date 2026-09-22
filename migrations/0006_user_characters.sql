-- user_characters 表：账号与角色卡的绑定关系（每个玩家最多 3 个，由接口层校验）
CREATE TABLE IF NOT EXISTS user_characters (
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_user_characters_user ON user_characters(user_id);
