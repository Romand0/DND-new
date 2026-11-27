-- 剧情经济账本与道具投送（story-management P2/P4）
-- 账本索引只保存源记录引用，不复制金额/物品明细；道具/已读按用户隔离。
CREATE TABLE IF NOT EXISTS story_ledger_links (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  character_id TEXT,
  note TEXT,
  occurred_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_story_ledger_scene
  ON story_ledger_links(campaign_id, scene_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_story_ledger_source
  ON story_ledger_links(campaign_id, source_kind, source_id);

CREATE TABLE IF NOT EXISTS story_handouts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  scene_id TEXT,
  kind TEXT NOT NULL,
  target_user_ids TEXT NOT NULL DEFAULT '[]',
  data TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  recalled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_story_handouts_campaign
  ON story_handouts(campaign_id, created_at);

CREATE TABLE IF NOT EXISTS story_handout_reads (
  handout_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  favorited_at INTEGER,
  PRIMARY KEY (handout_id, user_id)
);
