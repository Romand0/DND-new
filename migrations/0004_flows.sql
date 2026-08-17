CREATE TABLE IF NOT EXISTS flows (

id TEXT PRIMARY KEY,          -- 流程 ID，如 "spell:fireball"

name TEXT NOT NULL,

category TEXT NOT NULL DEFAULT 'custom',

version INTEGER NOT NULL DEFAULT 1,

data TEXT NOT NULL,            -- 完整 FlowDefinition 的 JSON 序列化

published_at INTEGER NOT NULL, -- 首次发布时间

updated_at INTEGER NOT NULL,   -- 最近发布时间

created_at INTEGER NOT NULL

);

CREATE INDEX IF NOT EXISTS idx_flows_category ON flows(category);

CREATE INDEX IF NOT EXISTS idx_flows_updated_at ON flows(updated_at DESC);
