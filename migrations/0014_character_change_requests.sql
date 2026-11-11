-- 角色卡玩家变更请求：玩家对绑定角色卡提交整卡快照，DM 审批（批准写入正式卡 / 驳回附理由）。
-- 一卡一 pending 由部分唯一索引在数据库层兜底；应用层提交前同样校验并返回友好错误。

CREATE TABLE IF NOT EXISTS character_change_requests (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  base_updated_at INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  reviewer_id TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ccr_campaign ON character_change_requests(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ccr_requester ON character_change_requests(requester_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccr_one_pending
  ON character_change_requests(character_id) WHERE status = 'pending';
