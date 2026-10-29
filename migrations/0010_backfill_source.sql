-- 为全部存量数据补"来源"字段，默认"玩家手册 2014"（幂等：只回填缺失或空值）。
-- spells/equipments 的业务字段存于 data JSON blob（无需改表结构）；
-- character_options 另有独立 source 提取列，列与内嵌字段都缺失时一并回填。

UPDATE spells SET data = json_set(data, '$.source', '玩家手册 2014')
WHERE json_extract(data, '$.source') IS NULL OR json_extract(data, '$.source') = '';

UPDATE equipments SET data = json_set(data, '$.source', '玩家手册 2014')
WHERE json_extract(data, '$.source') IS NULL OR json_extract(data, '$.source') = '';

UPDATE character_options
SET source = '玩家手册 2014',
    data = json_set(data, '$.source', '玩家手册 2014')
WHERE (source IS NULL OR source = '')
  AND (json_extract(data, '$.source') IS NULL OR json_extract(data, '$.source') = '');
