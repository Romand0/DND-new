-- users 表新增头像字段：存 R2 对象存储的公开 URL
ALTER TABLE users ADD COLUMN avatar TEXT;
