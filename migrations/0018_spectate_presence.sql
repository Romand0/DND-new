-- 玩家当前观战战斗（每人同时只处于一场）：DM 投送时按收件人 upsert，切换战斗即覆盖旧房间。
-- 与 table_messages 的记录语义分离：这里只保存当前状态，不堆积历史投送。
CREATE TABLE IF NOT EXISTS table_spectate_presence (
  user_id TEXT PRIMARY KEY,
  campaign_id TEXT,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spectate_presence_room
  ON table_spectate_presence(room_id, from_user_id);
CREATE INDEX IF NOT EXISTS idx_spectate_presence_campaign
  ON table_spectate_presence(campaign_id, room_id);
