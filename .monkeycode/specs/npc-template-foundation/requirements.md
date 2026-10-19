# Requirements Document — NPC 模板前置开发（怪物图鉴 2014 自动入库）

## Introduction

为流程引擎（Phase 3 身份映射）与战斗系统补齐 NPC 数据地基。当前 `NpcTemplate` 定义不完善（缺熟练加值、豁免熟练、抗性/免疫等），主要 NPC 来源《怪物图鉴》（Monster Manual 2014）无自动读取能力。本期交付：图鉴解析器（build-time）→ 种子 JSON → NpcTemplate 类型完善 → 落库与导入路径。

数据源锁定：`data/DND5e_chm/怪物图鉴/`（2014 版，Word 脏 HTML 格式，GBK/GB18030 编码）。含 14 个生物类型目录（约 297 文件）与非玩家角色目录（21 文件）；`资料/` 排除。

## Glossary

- **数据卡（stat block）**：怪物书中一块完整怪物数据（AC/HP/六维/豁免/技能/动作等）。
- **解析器**：`scripts/parse-monsters.mjs`，Node 脚本，读图鉴 HTML 产出种子 JSON。
- **种子 JSON**：`src/data/npcTemplates.json`，与 `equipments.json` 同模式的预置数据。
- **templateId**：模板业务标识（英文名 slug，如 `champion`），跨导入去重的匹配键。
- **解析报告**：`scripts/parse-monsters-report.md`，成功/失败/字段缺失清单。

## Requirements

### Requirement 1 — 图鉴解析器

**User Story:** AS DM，我要工具自动读取《怪物图鉴》全部数据卡，这样 NPC 模板无需手工录入。

#### Acceptance Criteria

1. WHEN 执行 `node scripts/parse-monsters.mjs`，解析器 SHALL 遍历 `data/DND5e_chm/怪物图鉴/` 下 14 个生物类型目录与 `非玩家角色/` 的全部 .htm/.html 文件，按 GBK/GB18030 转码后剥除 HTML 标签再按行解析。
2. 解析器 SHALL 从每张数据卡抽取：中英文名称、体型/种类/阵营行、护甲等级（数值+护甲描述）、生命值（数值+骰式）、速度、六维属性（数值+调整值）、豁免熟练、技能熟练、感官、语言、挑战等级（+XP）、熟练加值、特性文本、动作/附赠动作/反应条目（映射 NpcAttack：名称/命中加值/伤害骰/伤害类型/射程/普通与最大射程）。
3. IF 同一文件包含多张数据卡，解析器 SHALL 将其拆分为多条独立模板。
4. IF 某字段缺失或源文件格式异常（含源书笔误，如「魅（12」漏字），解析器 SHALL 把该条目记入解析报告并继续处理，产出 JSON 中对应字段留空，单字段失败不得中断整体解析。
5. 解析器 SHALL 幂等：重复执行产出字节一致的 JSON。
6. 解析器 SHALL 为每条模板生成稳定 templateId（英文名 slug 化）；IF 英文名缺失或 slug 撞名，SHALL 追加来源目录前缀消歧。

### Requirement 2 — NpcTemplate 类型完善

**User Story:** AS DM，我要 NPC 模板承载完整 5e 数据卡字段，这样战斗与流程引擎能取到真实数值。

#### Acceptance Criteria

1. `NpcTemplate` SHALL 新增可选字段：`proficiencyBonus`、`savingThrows`（熟练豁免属性列表）、`skills`（技能+加值）、`hpDice`、`damageResistances`、`damageImmunities`、`damageVulnerabilities`、`conditionImmunities`、`speedNotes`、`traits`（结构化特性条目）、`xp`、`source`（书源标注「怪物图鉴 2014」）。
2. WHILE 旧 localStorage 数据加载，`npcTemplateStore.load()` SHALL 对全部新增字段兜底为 undefined 安全值，旧数据打开零报错。
3. 类型变更 SHALL 只增不改：既有字段名与语义保持稳定。
4. NpcAttack SHALL 补充可选 `note`（动作附加文本，如「重骰一次失败的豁免」类描述挂在条目上）。

### Requirement 3 — 种子落库与导入

**User Story:** AS DM，我要图鉴数据开箱即用且可重复导入，这样无需手动搬运。

#### Acceptance Criteria

1. WHEN localStorage 中无 NPC 模板，`npcTemplateStore` SHALL 从种子 JSON 预置全部图鉴模板（与 `equipments.json` 同模式）。
2. WHEN 用户在数据管理页触发「重新导入怪物图鉴」，系统 SHALL 按 templateId 匹配执行创建或更新，且保留用户对既有模板的自定义字段改动。
3. 数据管理页 SHALL 展示导入结果统计（新增数/更新数/跳过数）。

### Requirement 4 — 模板消费衔接

**User Story:** AS DM，我要在创建 NPC 参战者时直接选用图鉴模板，这样开团配置提速。

#### Acceptance Criteria

1. NpcCreator SHALL 支持按名称、挑战等级、生物类型筛选与搜索导入模板。
2. WHEN 从模板创建参战者，参战者数据 SHALL 带入 templateId、proficiencyBonus 与 savingThrows（供 Phase 3 flowCompiler 身份映射消费）。

### Requirement 5 — 正确性验证

#### Acceptance Criteria

1. 解析报告 SHALL 满足 round-trip 核对：成功条数 + 失败条数 = 处理文件内数据卡总数；抽查至少 3 个不同目录的文件逐字段对照原文。
2. 抽查基准：兽人军官（AC 16 链甲、HP 93（11d8+44）、速度 30 尺）等已知值。
3. `npx tsc --noEmit` 与 `npm run build` SHALL 通过。
4. 解析器 SHALL 全程只读 DND5e_chm（该目录为只读数据源，禁止写入）。

## 已裁决项

- [x] 数据来源：`data/DND5e_chm/怪物图鉴/`（2014 版）；含 14 个生物类型目录与 `非玩家角色/`，`资料/`、`模板生物/` 排除
- [x] 字段深度：一次抽全——解析器把抗性/免疫/状态免疫/技能/特性全部抽进种子 JSON 与类型（可选字段），运行时消费分批
- [x] 落库路径：自动种子（首启预置，带 seeded 标记防重复）+ 数据管理页「重新导入怪物图鉴」按钮（按 templateId 去重，默认跳过已存在，可选覆盖）
