-- 角色全周期日志：战斗线索版块。
-- battle_id 关联战斗记录 id（battle 结算打包写入）；非战斗路径（DM 手改/日常）该列为 NULL。
-- 「战斗」版块按 battle_id 聚合展示一场战斗的全部变更；物资/法术版块照常按 category 拆包归类。

ALTER TABLE character_logs ADD COLUMN battle_id TEXT;

CREATE INDEX IF NOT EXISTS idx_charlogs_battle ON character_logs(battle_id, created_at DESC);
