-- 团组体系骨架（Phase A）：团组表、成员表、团组制品表，以及既有表加团组归属列。
-- 出版物条目（三宝书等）campaign_id 恒为 NULL，保持团组存储之外，查询时按团组规则书集筛选。

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  invite_code TEXT UNIQUE NOT NULL,
  rulebooks TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_members_user ON campaign_members(user_id);

-- 团组制品：战斗记录/宝藏/笔记/沙盘/日历/游戏时间（kind=singleton 为团组单例）与提案（proposal，预留位）
CREATE TABLE IF NOT EXISTS campaign_artifacts (
  id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, kind, id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_lookup ON campaign_artifacts(campaign_id, kind);

ALTER TABLE characters ADD COLUMN campaign_id TEXT;
ALTER TABLE equipments ADD COLUMN campaign_id TEXT;
ALTER TABLE spells ADD COLUMN campaign_id TEXT;
ALTER TABLE character_options ADD COLUMN campaign_id TEXT;
ALTER TABLE npc_templates ADD COLUMN campaign_id TEXT;
