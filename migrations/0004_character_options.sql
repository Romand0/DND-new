-- 角色选项库（种族/亚种/背景/职业/子职业）：
-- data 列存完整 JSON blob（对齐 spells/equipments 模式），提取列用于列表页排序过滤
CREATE TABLE IF NOT EXISTS character_options (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  parent_name TEXT,
  source TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_charopts_category ON character_options(category);
CREATE INDEX IF NOT EXISTS idx_charopts_parent ON character_options(parent_name);
