# 技术设计：技能全周期引擎（skill-fullcycle-engine）

Feature Name: skill-fullcycle-engine
Updated: 2026-11-18
状态：定稿 v1（决策记录 2026-11-18）

## Description

三层接入架构：被动处理器零操作（层 A）、主动技能按结算模式引擎化 + 数据提取器（层 B）、复杂技能专用硬编码（层 B 保留）。核心目标：玩家异步提交前一切数值静态可得，DM 审批零手填。

决策记录（2026-11-18 用户拍板）：
- 决策 1（作用域）：站点默认 + 团组覆盖。configs 表 `scope` 字段区分，解析时团组覆盖站点。
- 决策 2（开放效果分流）：引导神力拆形态接入既有引擎；荒野变形 P5 硬编码候选；神圣干预另议；奥术回想/魔能掌控非战斗后置。裁定队列机制本轮不建。
- 决策 3（骰值归属）：玩家端掷（与 attack d20 玩家填值先例一致），结果随 op 提交，DM 入账直接采用、零额外操作。依据：线下 DND 工具定位。

## Architecture

```mermaid
graph TD
    subgraph 种子与录入
        SEED[种子库 PHB2014 特性] --> BATCH[批量提取脚本]
        DMEDIT[DM 特性编辑界面] --> EXTRACT[数据提取器 Modal]
    end
    EXTRACT --> CONF
    BATCH --> CONF
    CONF[云端 feature_engine_configs D1] --> RESOLVE
    REG[代码注册表 featureCapabilities.ts] --> RESOLVE
    RESOLVE[resolveFeatureCapability 解析链] --> PLAYER[玩家端 MyTurnPanel]
    RESOLVE --> DMSIDE[DM 端面板/沙盘]
    PLAYER -->|静态预览| PLAYER
    PLAYER -->|feature-use op| QUEUE[审批队列]
    QUEUE --> APPLY[turnCommitApply 分渠道结算]
    APPLY --> RECORD[记录行 + HP/池/状态落地]
    subgraph 层A 被动处理器
        RESOLVE --> PASSIVE[passiveCombatRules 七类]
        PASSIVE --> SNAP[战斗快照派生]
    end
    subgraph 层B 专用硬编码
        RESOLVE --> SPECIAL[aoe_save/status/rider 专用组件]
    end
    subgraph 层C 开放效果分流
        RESOLVE --> SPLIT["引导神力拆形态→B3/B4/B5/B8"]
        RESOLVE --> WILD["荒野变形·P5硬编码候选"]
    end
```

解析顺序（R5）：代码注册表 → 云端配置（团组覆盖站点）→ manual 兜底（现有行为）。开放效果技能按 R6 分流（拆形态/硬编码候选/范围外标记）。

## 引擎类型清单（定稿口径）

### 层 A：被动处理器（复用 passive-engine 冻结七类，扩容方式 = 配置表）

| # | 处理器 | 已有派生入口 | 扩容方式 |
|---|--------|-------------|---------|
| A1 | 豁免优劣势（含灵光） | advantageRules `passive-feature` 检测器 | 配置表条目（trait 名 → {save, advantage, 条件, 门槛}） |
| A2 | 伤害抗性/免疫 | `deriveCharacterAffinities` | 配置表（伤害类型 + 抗/免） |
| A3 | 无甲防御 AC | `resolveUnarmoredAc` | 公式配置 |
| A4 | 速度修正 | `deriveSpeedModifier` | 数值配置 |
| A5 | 被动检定三件套 | `derivePassiveChecks` | 加值配置 |
| A6 | 黑暗视觉 | `deriveDarkvision` | 距离配置 |
| A7 | 先攻优劣势 | `deriveInitiativeAdvantage` | 配置条目 |

现覆盖约 15 名 → 目标 156 名被动数值类全接入（display-only 设定类 112 名仅标记「设定型」，进引擎）。

### 层 B：主动技能功能引擎

| # | 引擎 | 状态 | spec 要点 | 参照技能 |
|---|------|------|----------|---------|
| B1 | 检定加骰 checkModifier | 已有 | {pool, dice, 适用范围(检定/攻击/豁免/法术), 有效期} | 诗人激励/卓越战技/战斗激励/精-class |
| B2 | 优劣势声明 advantage | 已有 | {target: self/attack, duration} | 鲁莽攻击 |
| B3 | 自体治疗 heal | 新增 | {dice, flat, 等级系数, 或 tempHp} | 回气(1d10+战士等级)、矮人体魄类 |
| B4 | 命中触发 attack_rider | 已有 | {damage dice+type, 触发条件, 环级升级} | 至圣斩/震慑拳 |
| B5 | 范围豁免 aoe_save | 已有(专用) | {shape, dice+type, dcFormula, saveHalf} | 吐息武器 |
| B6 | 状态切换 status | 已有 | {status, 门槛, 期间效果(抗性/优势集)} | 狂暴 |
| B7 | 资源转换 resource_conv | 新增 | {convert: {from, to}, 一次性效果集} | 动作如潮(附赠→主动作)、灵巧动作(bonus→疾走/撤消/躲藏) |
| B8 | 反应处理器 reaction | 已有 | {trigger: attack/spell_cast/damage, effect, 成本} | 拨挡飞弹/轻身坠/直觉闪避/护盾术（数据面由提取器/种子填充） |

### 层 B 保留：专用硬编码（效果逻辑无法 spec 表达）

已有：吐息武器（B5 几何交互）、狂暴（B6 复合状态）、震慑拳（rider+豁免挂状态）、至圣斩（环级升级）。
新增立项评估：空灵体（四气多效应）、混元体（伤害类型切换）、渗透劲/暗影技艺（命中 debbuff）、灵魂力量。
判据：多效应组合 / 特殊时点 / 专用 UI 交互 → 硬编码；纯数值表达 → spec 引擎。

## Components and Interfaces

### 1. 配置数据层（P1）

**迁移 `migrations/0017_feature_engine_configs.sql`：**

```sql
CREATE TABLE feature_engine_configs (
  id TEXT PRIMARY KEY,
  feature_name TEXT NOT NULL,      -- 特性名（解析键）
  channel TEXT NOT NULL,           -- 'heal'|'check_modifier'|'resource_conv'|'reaction'|...
  spec_json TEXT NOT NULL,         -- 引擎 spec（渠道 schema 校验后入库）
  scope TEXT NOT NULL,             -- 'site' 或 campaign id（决策点 1）
  source TEXT,                     -- 'extractor'|'seed_batch'|'manual'
  confidence REAL,                 -- 提取器置信度 0~1
  created_by TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX idx_fec_name ON feature_engine_configs(feature_name);
CREATE INDEX idx_fec_scope ON feature_engine_configs(scope);
```

**API（`functions/api/feature-configs/`）：** `index.ts` GET（?scope=&name= 批量）/ POST；`[id].ts` PUT / DELETE。写权限 admin；玩家端 GET 无需 admin（读配置算预览）。`src/lib/api.ts` 同步客户端函数。

**resolveFeatureCapability 数据化（`src/data/featureCapabilities.ts`）：**

```
resolveFeatureCapability(feature, ctx):
  1. REGISTRY（代码注册表，现有 6 条 + 专用硬编码）
  2. cloudConfigCache（combat 开战时 api 拉取，localStorage 缓存兜底离线）
     - scope 匹配：当前团组条目覆盖同名 site 条目
  3. 无配置 → manual 兜底（现有行为：池扣自动化 + 手动结算提示 + 「未接入」标记）
```

### 2. 数据提取器（P2）

**组件 `src/components/FeatureExtractorModal.tsx`：**
入口：CharacterDetail 特性区「接入引擎」按钮（DM 权限）+ 数据页种子库批量入口。
流程：选引擎类型（按描述关键词预推荐 channel）→ 文本提取（命中片段 `<mark>` 高亮 + 表单预填）→ 低置信项逐项「需人工确认」标记 → 确认提交（schema 校验）→ POST configs。

**提取正则集（`src/data/featureExtract.ts`，纯函数可单测）：**

| 目标 | 正则/规则 |
|------|----------|
| 骰式 | `/(\d*)\s*d\s*(\d+)(\s*[+＋-]\s*[\d]+)?/g` |
| DC | `/DC\s*(\d+)/` 与 `8+熟练+{属性}调整值` 公式 |
| 恢复量 | `/恢复\s*(\d+d\d+(?:\s*[+＋]\s*\d+)?|\d+)\s*点?生命/` |
| 临时HP | `/获得\s*(\d+d\d+(?:\s*[+＋]\s*\d+)?|\d+)\s*点?临时生命/` |
| 伤害类型 | 火焰|闪电|毒液|寒冰|光耀|黯蚀|雷鸣|力场|心灵|酸液|钝击|穿刺|挥砍 |
| 范围形状 | 复用 `describeAoeSpec`/`parseAoeSpec`（锥状/线状/半径球状/立方） |
| 属性关联 | `(力量|敏捷|体质|智力|感知|魅力)调整值` |
| 池推断 | `每回合|每日|短休|长休` + `等于.*等级` → poolKey/refreshPolicy |
| 门槛 | 职业等级公式（`第N级`/`N级`）→ minLevel |

置信度规则：骰式+类型双命中=0.9；单命中=0.6；公式推断=0.5；缺命中=0（标记人工）。

**批量脚本 `scripts/extract-features-batch.mjs`：** 读种子 36 显式条目 + 被动 156 名分类清单 → 跑正则集 → 输出逐条报告（成功/低置信/失败清单）→ 成功项 POST 站点级 configs（预填，`source: 'seed_batch'`）。

### 3. 引擎补齐（P3：B3 heal + B7 resource_conv）

**spec schema（`src/data/featureSpecs.ts`）：**

```ts
// B3 heal
interface HealSpec { dice?: string; flat?: number; levelFactor?: number;
  levelAttr?: '职业等级'|'武僧等级'|...; type: 'hp'|'temp'; }
// B7 resource_conv
interface ResourceConvSpec { convert?: { from: 'bonus'|'action'; to: 'action'|'dash'|'disengage'|'hide'|'bonus' };
  grants?: { action?: boolean; bonusRestore?: boolean; }[]; }
```

**玩家端静态预览 `computeFeaturePreview(feature, spec, ctx)`（combatStore 纯函数）：** 返回 {消耗, 恢复区间, DC, 描述}，MyTurnPanel/MyCombatantPanel 特性按钮 hover/展开展示。

**op 协议扩展（决策 3：玩家端掷）：** `feature-use` op 增 `channel` + `specRef`(configId 或 registry key) + `params`（含玩家已掷骰值，如 heal 的 `diceRolls`）。玩家预览先展示区间，掷骰后展示确定值，提交前最终确认。turnCommitApply 增分支：
- heal → hp += op.params.diceRolls 求和（DM 入账直接采用，可复核），记录行含骰值明细
- resource_conv → combatant actions/bonusActions 调整
- spec 缺失/解析失败 → manual 兜底（R7.3 零回归）

### 4. 开放效果技能分流（P5，决策 2）

- **引导神力**：容器特性选择弹窗（四选一）→ 子形态映射引擎（生命→B3、毁灭→B4、不灭信念→B8 reaction、光辉→B5）；池扣除按引导神力次数计。
- **荒野变形**：专用硬编码候选——变身 = 参战者数据替换（HP/AC/攻击形态按野兽数据表），P5 内评估立项，超预期则顺延。
- **神圣干预**：标记「裁定型·另议」，本轮范围外。
- **奥术回想/魔能掌控**：标记「非战斗·后置」，本轮范围外。

## Data Models

- 配置表见上 SQL。spec_json 内部结构按渠道 schema（featureSpecs.ts 类型定义，入库前校验）。
- combat 开战快照新增 `featureConfigs: Record<featureName, ResolvedCapability>`（随记录回溯可重算）。
- 特性编辑界面（CharacterDetail）展示接入徽标：「已接入·heal」/「未接入」（R1.3/R1.4）。

## Correctness Properties

1. 解析确定性：同名特性在任何端解析结果一致（代码 > 团组 > 站点 > manual 兜底）。
2. 预览=结算一致：玩家预览的消耗（池/动作）与 turnCommitApply 扣减量恒等。
3. 源不可变性：引擎结算只写 CombatRecord/equipmentChanges，源角色卡不受影响（既有不变量）。
4. 配置回退安全：云端不可达时 localStorage 缓存兜底；无缓存时降级 manual 行为（R7.3 零回归）。
5. 提取器无静默默认：置信度低于阈值的字段必须人工确认后才入库。
6. 骰值单次确认：op 携带的骰值由玩家端一次性掷出并锁定，DM 入账原样采用（可复核记录行），结算不再重掷。

## Error Handling

- spec schema 校验失败：POST 返回 400 + 具体字段错误；提取器 UI 逐项标红。
- 云端配置拉取失败：降级缓存/代码注册表，UI 提示「配置离线」。
- op 结算时 spec 缺失（DM 端比玩家端旧）：op 携带 spec 快照，DM 端优先用快照结算，缺失再降级 manual 兜底。
- 种子批量提取失败项：报告清单输出，人工补录入口（不阻塞批次）。

## Test Strategy

- 探针扩展（`probe-active-skills.cjs`）：
  - 第 14 段：解析顺序（代码覆盖云端/团组覆盖站点/离线回退）
  - 第 15 段：提取器 UI 流程（打开→提取→确认→写入→立即生效）
  - 第 16 段：heal/resource_conv 全周期（玩家 op → DM 入账 → HP/动作变化 + 记录行 + 预览一致）
- `probe-passive2.cjs` 扩展：配置表扩容条目派生断言（A1-A7 各抽新条目）
- 单测性质正则集：featureExtract 纯函数在探针内跑样本断言（无需测试框架）
- 每阶段验证：`npx tsc -p tsconfig.app.json --noEmit` + `npm run build`（background_terminal）+ 全量 `run.sh` ALL PROBES OK

## 实施阶段（开发计划）

| 阶段 | 内容 | 主要文件 | 验证 |
|------|------|---------|------|
| P1 配置数据层 | 迁移 0017 + API CRUD + resolveFeatureCapability 数据化 + 6 条注册平移验证 | migrations/0017、functions/api/feature-configs/*、src/lib/api.ts、src/data/featureCapabilities.ts | 探针 1-13 回归 + 14 段 |
| P2 数据提取器 | 正则集 + Modal + 单项流程 + 批量脚本跑种子 | src/data/featureExtract.ts、src/components/FeatureExtractorModal.tsx、scripts/extract-features-batch.mjs | 15 段 + 批量报告 |
| P3 引擎补齐一 | B3 heal + B7 resource_conv（schema/预览/op/入账） | src/data/featureSpecs.ts、combatStore、turnCommitApply、MyTurnPanel | 16 段 |
| P4 被动扩容 | A1-A7 配置表数据化 + 156 被动分批接入 + 徽标 | passiveCombatRules/advantageRules 读取 configs、CharacterDetail | probe-passive2 扩展 |
| P5 收尾 | 专用硬编码批次（空灵体/混元体等）+ 引导神力拆形态 + 荒野变形评估 + 反应数据面 + 已有通道 spec 化机会评估 | 专用引擎组件、引导神力选择弹窗 | 全量探针 + progress.md 回写 |

每阶段独立分支（feature/fullcycle-pN）+ 原子提交 + 合并前全绿。P1/P2 为基建优先；P3 后每阶段结束都有可验收的用户价值增量。

## References

[^1]: `.monkeycode/specs/passive-engine/progress.md` — 七类口径冻结与探针基线
[^2]: `.monkeycode/specs/active-skills-engine/progress.md` — 层 1 六条与通道现状
[^3]: `src/data/featureCapabilities.ts` — 现有注册表
[^4]: `src/lib/turnCommitApply.ts` — 审批入账分支
[^5]: `src/data/advantageRules.ts` — 注册式优劣势引擎
[^6]: `src/data/passiveCombatRules.ts` — 七类被动派生
[^7]: `scripts/annotate-feature-resources.mjs` — 现有种子标注脚本（POOLED 21 池主映射）
