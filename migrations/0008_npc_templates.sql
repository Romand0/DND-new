-- NPC 模板（怪物图鉴）表：421 条解析种子 + 用户自定义模板
-- data 列存完整 NpcTemplate JSON；template_id 唯一约束支撑幂等种子导入
CREATE TABLE IF NOT EXISTS npc_templates (
  id TEXT PRIMARY KEY,
  template_id TEXT UNIQUE,
  name TEXT NOT NULL,
  cr TEXT DEFAULT '',
  creature_type TEXT DEFAULT '',
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_npc_templates_name ON npc_templates(name);
