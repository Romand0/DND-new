-- 存量数据迁入默认团组（幂等：固定 id + INSERT OR IGNORE + IS NULL 守卫，可重复执行）。
-- 默认团组承接升级前全部数据：站点管理员登记为 DM，其余账号登记为玩家；
-- characters 归入默认团组；图鉴四库条目为出版物条目（campaign_id 保持 NULL，规则书集查询时筛选）。

INSERT OR IGNORE INTO campaigns (id, name, description, invite_code, rulebooks, created_by, created_at)
VALUES ('campaign-default', '默认团组', '系统升级时自动创建的初始团组', 'DEFAULT8', '["玩家手册 2014"]', 'system', unixepoch());

INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role, joined_at)
SELECT 'campaign-default', id,
       CASE WHEN is_admin = 1 THEN 'dm' ELSE 'player' END,
       unixepoch()
FROM users;

UPDATE characters SET campaign_id = 'campaign-default' WHERE campaign_id IS NULL;
