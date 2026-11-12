-- 角色全周期日志：入库（D1）的角色信息变更记录。
-- category: item=物资钱币 / spell=法术 / growth=角色成长 / general=其他
-- kind 细分动作（acquire/remove/qty/currency/spell_cast/slot_change/exp_change/level_up/growth_task/cr_applied/...）；
-- detail 存 JSON 补充（前后值/法术位环级/成长任务选项等）；source 标来源（battle/change_request/store/import）。

CREATE TABLE IF NOT EXISTS character_logs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  source TEXT,
  actor_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_charlogs_char ON character_logs(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charlogs_campaign ON character_logs(campaign_id, created_at DESC);
