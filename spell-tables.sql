-- 法术描述表格自动提取（node scripts/parse-spell-tables.mjs 生成）
-- json_set 写入 $.table；description 用 REPLACE 删除表格压平残留文本

-- 虹光喷射（七环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| 1 || 红Red || 目标豁免失败时受 10d6 的火焰伤害，成功则伤害减半。 ||
| 2 | 橙Orange | 目标豁免失败时受 10d6 的强酸伤害，成功则伤害减半。 |
| 3 | 黄Yellow | 目标豁免失败时受 10d6 的闪电伤害，成功则伤害减半。 |
| 4 | 绿Green | 目标豁免失败时受 10d6 的毒素伤害，成功则伤害减半。 |
| 5 | 蓝Blue | 目标豁免失败时受 10d6 的寒冷伤害，成功则伤害减半。 |
| 6 | 靛Indigo | 目标豁免失败时受束缚。它必须在其每回合结束时进行一次体质豁免。三次豁免成功后法术终止。三次豁免失败后目标将永久陷入石化状态。成功或失败的豁免不需要连续，只需记下两边的数量直至其中一种达到三次。 |
| 7 | 紫Violet | 目标豁免失败时陷入目盲。其必须在你下一回合开始时进行一次感知豁免。豁免成功则目盲状态终止。豁免失败则该生物被传送到另一个 DM 指定的位面并且不再目盲。（典型情况是不在家乡位面的生物被驱逐回家，而其他生物通常会被传送到星界或以太位面。） |
| 8 | 特殊Special | 目标被两条射线打中。再掷两次，结果为 8 时再重掷。 |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), '1 红 Red 目标豁免失败时受 10d6 的火焰伤害，成功则伤害减半。 2 橙 Orange 目标豁免失败时受 10d6 的强酸伤害，成功则伤害减半。 3 黄 Yellow 目标豁免失败时受 10d6 的闪电伤害，成功则伤害减半。 4 绿 Green 目标豁免失败时受 10d6 的毒素伤害，成功则伤害减半。 5 蓝 Blue 目标豁免失败时受 10d6 的寒冷伤害，成功则伤害减半。 6 靛 Indigo 目标豁免失败时受束缚。它必须在其每回合结束时进行一次体质豁免。三次豁免成功后法术终止。三次豁免失败后目标将永久陷入石化状态。成功或失败的豁免不需要连续，只需记下两边的数量直至其中一种达到三次。 7 紫 Violet 目标豁免失败时陷入目盲。其必须在你下一回合开始时进行一次感知豁免。豁免成功则目盲状态终止。豁免失败则该生物被传送到另一个 DM 指定的位面并且不再目盲。（典型情况是不在家乡位面的生物被驱逐回家，而其他生物通常会被传送到星界或以太位面。） 8 特殊 Special 目标被两条射线打中。再掷两次，结果为 8 时再重掷。', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'prismatic-spray';

-- 传送术（七环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| 熟悉程度 || 遇难 || 相似地区 || 偏离地点 || 抵达地点 ||
| 永久法阵 | - | - | - | 01~100 |
| 相关物件 | - | - | - | 01~100 |
| 非常熟悉 | 01~05 | 06~13 | 14~24 | 25~100 |
| 偶尔见过 | 01~33 | 34~43 | 44~53 | 54~100 |
| 见过一次 | 01~43 | 44~53 | 54~73 | 74~100 |
| 听过描述 | 01~43 | 44~53 | 54~73 | 74~100 |
| 查无此地 | 01~50 | 51~100 | - | - |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), '熟悉程度 遇难 相似地区 偏离地点 抵达地点 永久法阵 - - - 01~100 相关物件 - - - 01~100 非常熟悉 01~05 06~13 14~24 25~100 偶尔见过 01~33 34~43 44~53 54~100 见过一次 01~43 44~53 54~73 74~100 听过描述 01~43 44~53 54~73 74~100 查无此地 01~50 51~100 - -', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'teleport';

-- 活化物件（五环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| 体型 || HP || AC || 攻击 || 力量 || 敏捷 ||
| 微型 | 20 | 18 | 命中+8，伤害 1d4+4 | 4 | 18 |
| 小型 | 25 | 16 | 命中+6，伤害 1d8+2 | 6 | 14 |
| 中型 | 40 | 13 | 命中+5，伤害 2d6+1 | 10 | 12 |
| 大型 | 50 | 10 | 命中+6，伤害 2d10+2 | 14 | 10 |
| 巨型 | 80 | 10 | 命中+8，伤害 2d12+4 | 18 | 6 |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), '体型 HP AC 攻击 力量 敏捷 微型 20 18 命中+8，伤害 1d4+4 4 18 小型 25 16 命中+6，伤害 1d8+2 6 14 中型 40 13 命中+5，伤害 2d6+1 10 12 大型 50 10 命中+6，伤害 2d10+2 14 10 巨型 80 10 命中+8，伤害 2d12+4 18 6', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'animate-objects';

-- 造物术（五环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| 材质 || 持续时间 ||
| 植物质vegetable matter | 1 日 |
| 石质stone，水晶crystal | 12 小时 |
| 贵金属precious metals | 1 小时 |
| 宝石gems | 10 分钟 |
| 精金adamantine，秘银mithral | 1 分钟 |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), '材质 持续时间 植物质 vegetable matter 1 日 石质 stone，水晶 crystal 12 小时 贵金属 precious metals 1 小时 宝石 gems 10 分钟 精金 adamantine，秘银 mithral 1 分钟', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'creation';

-- 转生术（五环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| d100 || 种族 ||  || d100 || 种族 ||
| 01~04 | 龙裔 |  | 47~52 | 岩石侏儒 |
| 05~13 | 丘陵矮人 |  | 53~56 | 半精灵 |
| 14~21 | 山地矮人 |  | 57~60 | 半兽人 |
| 22~25 | 黑暗精灵 |  | 61~68 | 轻足半身人 |
| 26~34 | 高等精灵 |  | 69~76 | 强魄半身人 |
| 35~42 | 木精灵 |  | 77~96 | 人类 |
| 43~46 | 林侏儒 |  | 97~00 | 提夫林 |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), 'd100 种族 d100 种族 01~04 龙裔 47~52 岩石侏儒 05~13 丘陵矮人 53~56 半精灵 14~21 山地矮人 57~60 半兽人 22~25 黑暗精灵 61~68 轻足半身人 26~34 高等精灵 69~76 强魄半身人 35~42 木精灵 77~96 人类 43~46 林侏儒 97~00 提夫林', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'reincarnate';

-- 探知术（五环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| 了解程度 || 豁免调整值 ||  || 联系程度 || 豁免调整值 ||
| 二手信息（你曾经听说过受术者） | +5 |  | 肖像或图像 | -2 |
| 直接信息（你曾经见过受术者） | +0 |  | 所有物或衣物 | -4 |
| 熟悉（你对受术者很了解） | -5 |  | 身体部位，头发，指甲或类似物件 | -10 |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), '了解程度 豁免调整值 联系程度 豁免调整值 二手信息（你曾经听说过受术者） +5 肖像或图像 -2 直接信息（你曾经见过受术者） +0 所有物或衣物 -4 熟悉（你对受术者很了解） -5 身体部位，头发，指甲或类似物件 -10', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'scrying';

-- 操控天气（八环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| 降水Precipitation ||  || 气温Temperature ||  || 风势Wind ||  ||  ||  ||
| 等级 | 状况 |  | 等级 | 状况 |  | 等级 | 状况 |
| 1 | 天晴clear |  | 1 | 酷热unbearable heat |  | 1 | 无风calm |
| 2 | 薄云light clouds |  | 2 | 炎热hot |  | 2 | 和风moderate wind |
| 3 | 多云overcast，有雾ground fog |  | 3 | 暖和warm |  | 3 | 强风strong wind |
| 4 | 有雨rain，冰雹hail，有雪snow |  | 4 | 清凉cool |  | 4 | 狂风gale |
| 5 | 暴雨torrential rain，冰暴driving hail，暴雪blizzard |  | 5 | 寒冷cold |  | 5 | 暴风storm |
|  |  |  | 6 | 极寒arctic cold |  |  |  |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), '降水 Precipitation 气温 Temperature 风势 Wind 等级 状况 等级 状况 等级 状况 1 天晴 clear 1 酷热 unbearable heat 1 无风 calm 2 薄云 light clouds 2 炎热 hot 2 和风 moderate wind 3 多云 overcast，有雾 ground fog 3 暖和 warm 3 强风 strong wind 4 有雨 rain，冰雹 hail，有雪 snow 4 清凉 cool 4 狂风 gale 5 暴雨 torrential rain，冰暴 driving hail，暴雪 blizzard 5 寒冷 cold 5 暴风 storm 6 极寒 arctic cold', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'control-weather';

-- 困惑术（四环.html）
UPDATE spells SET data = json_set(data, '$.table', '|| d10 || 行为 ||
| 1 | 该生物使用其所有移动力向一个随机方向移动。你可以掷一次 d8 并设定每个骰值代表的方向以决定其最终移动方向。该生物本回合不执行任何动作。 |
| 2-6 | 该生物本回合不移动也不执行任何动作。 |
| 7-8 | 该生物使用其动作对可触及范围内一个随机目标发动一次近战攻击。如果没有生物在其触及范围内，则该生物本回合什么都不做。 |
| 9-10 | 该生物本回合内可以正常的移动和行动。 |', '$.description',
  REPLACE(REPLACE(json_extract(data, '$.description'), 'd10 行为 1 该生物使用其所有移动力向一个随机方向移动。你可以掷一次 d8 并设定每个骰值代表的方向以决定其最终移动方向。该生物本回合不执行任何动作。 2-6 该生物本回合不移动也不执行任何动作。 7-8 该生物使用其动作对可触及范围内一个随机目标发动一次近战攻击。如果没有生物在其触及范围内，则该生物本回合什么都不做。 9-10 该生物本回合内可以正常的移动和行动。', ' '), '  ', ' '))
WHERE json_extract(data, '$.id') = 'confusion';

