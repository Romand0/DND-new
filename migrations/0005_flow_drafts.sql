-- 草稿表：1:1 指向已发布流程，UNIQUE(parent_id) 保证单草稿约束
CREATE TABLE IF NOT EXISTS flow_drafts (
  parent_id TEXT PRIMARY KEY,        -- 外键 → flows.id，同时作为主键保证唯一
  data      TEXT NOT NULL,           -- FlowDefinition 的 JSON 序列化
  forked_at INTEGER NOT NULL,        -- 从已发布版派生的时间
  updated_at INTEGER NOT NULL        -- 最近本地保存时间
);

-- 索引：按最近编辑排序
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON flow_drafts(updated_at DESC);