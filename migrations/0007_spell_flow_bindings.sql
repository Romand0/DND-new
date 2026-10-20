-- 法术-流程绑定关系表（此前仅存在于生产 D1，仓库迁移缺失）
CREATE TABLE IF NOT EXISTS spell_flow_bindings (

id TEXT PRIMARY KEY,             -- 绑定 ID，格式 "binding-{秒级时间戳}-{随机串}"

spell_id TEXT NOT NULL,          -- 法术 ID（spells.id）

flow_id TEXT NOT NULL,           -- 流程 ID（flows.id），如 "spell:vicious-mockery"

created_at INTEGER NOT NULL,     -- 秒级时间戳

updated_at INTEGER NOT NULL      -- 秒级时间戳

);

CREATE INDEX IF NOT EXISTS idx_spell_flow_bindings_spell_id ON spell_flow_bindings (spell_id);

CREATE INDEX IF NOT EXISTS idx_spell_flow_bindings_flow_id ON spell_flow_bindings (flow_id);
