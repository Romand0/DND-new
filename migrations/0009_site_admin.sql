-- 站点管理员独立于游戏身份：role（dm/player）表示玩家在游戏中的身份，
-- is_admin 表示是否拥有站点管理/编辑权限（与具体游戏无关）。
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

-- 兼容旧数据：原先靠 role=dm 兼作站点管理员，迁移时保留这部分人的管理权限
UPDATE users SET is_admin = 1 WHERE role = 'dm';

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
