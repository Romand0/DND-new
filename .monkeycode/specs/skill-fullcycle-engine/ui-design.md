# UI 层设计规划：特性/技能弹窗家族（skill-fullcycle-engine）

Feature Name: skill-fullcycle-engine
Updated: 2026-11-19
状态：定稿 v1（P5 引擎侧并行推进，本文档为其 UI 前瞻约定）

## Description

特性/技能相关的战斗弹窗此前跟随引擎批次逐个产生，形态决策散落在 progress.md 交付明细与 MEMORY.md 经验条目中，收敛动作（如 DiceInputModal 抽通用件）均为被动触发。本文档将既有弹窗形态、交互惯例、P5 前瞻入口与收敛规则集中成文，作为引擎侧（P5 专用处理器批次）并行推进时的 UI 契约：引擎批次动工前 UI 形态先有约定，避免每个弹窗重新发明。

补充规划（2026-11-19 用户拍板）：特殊文本记录（§5）与特殊资源双线索模型（§6）——战斗面板需支持以技能为线索与以体系为线索两类资源（前者如每次长休后使用一次的技能，后者如战技：多种战技共享卓越骰经济）。

## 1. 弹窗家族总表

| 组件 | 文件 | 出现端 | 渠道/职责 | spec 驱动字段 | 关键 DOM 锚点 |
|------|------|--------|-----------|---------------|---------------|
| FeatureCheckModifierModal | `components/combat/FeatureCheckModifierModal.tsx` | DM（CombatSession）+ 玩家（PlayerSpectate） | checkModifier：选友方目标 + 逐项检定加值（骰值手填） | `capability.checkModifier`（roll 格式 / 每目标加值） | 弹窗本体无专用 testid，目标行走 friendlies 渲染 |
| FeatureConvTargetModal | `components/combat/FeatureConvTargetModal.tsx` | DM + 玩家 | resource_conv：多目标转移选择（自伤/目标/数量） | `capability.resourceConv`（fromResource/toResource/rate） | TARGET_DESC 映射展示资源说明 |
| HealRollModal | `components/combat/HealRollModal.tsx` | DM + 玩家 | heal：线下掷恢复骰 → 填结果 → 明细预览确认 | `capability.heal`（HealSpec: dice/flat/levelFactor/type） | `heal-roll-modal` / `heal-roll-input` |
| DiceInputModal | `components/combat/DiceInputModal.tsx` | 玩家（PlayerSpectate） | 通用线下骰填值（当前用于 aoe 伤害骰） | 无 spec 依赖（纯通用件：title/diceText/hint/min/max） | `dice-input-modal` / `dice-input-value` |
| FeatureAoeSaveModal | `components/combat/FeatureAoeSaveModal.tsx` | 仅 DM | aoe_save：几何放置 + 伤害骰填值 + 逐目标豁免 d20 采集 | `capability.aoeSave`（save DC / damage / aoeShapes 几何） | 伤害输入框 + 逐目标豁免输入框 + 掷骰按钮 |
| 特性「…」信息对话框 | 内嵌于 `pages/CharacterDetail.tsx`（非独立文件） | 角色卡（非战斗层） | 只读信息：作用方式切换 / 被动三态徽标+note / 提取器入口 | spec 数据（被动七表、提取器正则命中） | `data-feature-info` / `data-passive-badge` / `data-extract-feature` |

辅助组件（非战斗弹窗，一并登记防遗漏）：

- `FeatureExtractorModal`（P2 提取器单项 UI）：入库辅助，产出 spec JSON 文本，人工合并工序已取消，批量路径走 `scripts/extract-features-batch.mjs`（主路径）。
- `AoETargetStep`（PlayerSpectate 内 aoe 朝向/几何步骤）：玩家端 aoe 提交的前置环节，DiceInputModal 在其确认后弹出。
- `FeatureSystemView`：特性系统总览页（资料库层，只读）。

出现端分布规律：DM 独占 = 需要战场全景或逐目标采集的结算（aoe_save）；玩家独占 = 提交前填值环节的通用件（DiceInputModal——DM 端同信息已由 FeatureAoeSaveModal 覆盖）；双端 = 目标选择与单目标填值（checkModifier / conv / heal）。

## 2. 交互惯例（成文）

### 2.1 资源扣减时点：确认时扣，取消零损失

多目标/多环节弹窗（ConvTarget / HealRollModal / 未来同形态）一律在弹窗**确认回调内**扣资源，取消（onClose）零损失。探针断言「UI 扣槽」前提：开启 `resourceConsumption` 严格模式。禁止在弹窗打开时预扣。

### 2.2 线下骰填值三形态

| 形态 | 组件 | 适用 | 特征 |
|------|------|------|------|
| 单骰专用 | HealRollModal | 恢复量（1d10 + 固定 + 等级明细预览） | 带结算明细预览与范围校验（min/max 由 planHealAmount 推导） |
| 通用单值 | DiceInputModal | 任意「掷一次填一个数」（aoe 伤害、未来 flow 脚本树 damage 节点） | 零业务依赖，props 传骰面文本与范围 |
| 逐骰槽位 | CombatDamageModal（既有） | 伤害多骰袋逐项填值 | attack_rider / 法术 effectDiceValues 同口径 |

选择规则：需要结算明细预览或等级缩放推导的用专用形态；无推导逻辑的一律 DiceInputModal，禁止再造单骰专用弹窗。嵌套于 InfoPanel（z-50）之上的技能弹窗一律 `z-[60]`（HealRollModal / DiceInputModal 与 Conv / CheckModifier / AoeSave 同层）。

### 2.3 DM 强校验 vs op 缺值标注兜底的分界

- **DM 端有 UI 的弹窗**（FeatureAoeSaveModal）：confirm 强制校验阻断（未填 alert 提示），掷骰/重掷按钮保留为显式便捷动作。有 UI 时阻断优于静默跳过。
- **op 缺值兜底**（turnCommitApply）：玩家端 op 缺骰值字段时零虚构——heal 落固定+等级部分并标注「1d10 未填(跳过)」；aoe 未填 0 伤害标注 / 豁免未填目标跳过标注手动结算。不自动重掷（虚构线下不存在的骰值导致账实分离）。

### 2.4 骰值呈现口径

所有引擎渠道的骰值环节统一为「线下骰」：UI 展示骰面文本（如 `1d10`）作为格式提示，玩家/DM 在桌面掷骰后填入结果；弹窗内掷骰按钮（rollDice 调用）仅是便捷动作，产出值同样落入输入框走同一确认路径。引擎处理器零暗骰。

## 3. P5 前瞻（引擎批次动工前先定 UI 形态）

| 入口 | 引擎侧 | UI 形态约定 |
|------|--------|-------------|
| 引导神力 | 拆 4 形态（生命→heal、毁灭→aoe_save、不灭信念→reaction、光辉→B5 几何） | **角色卡预选形态**：特性「…」信息对话框内四选一，选定固化到 feature 静态数据随战斗载入；战斗层按已选形态直接路由对应渠道流程（零现选弹窗）；未预选的容器特性战斗中不可用（提示回角色卡预选）；池扣除按容器次数计（确认时扣，惯例 2.1） |
| 暗影技艺 | 容器四选一（黑暗术/黑暗视觉/行动无踪/沉默术，2 气 + 动作） | 与引导神力共用容器预选机制：角色卡信息对话框四选一 → 战斗按已选子形态路由（声明/status 渠道）；同一机制两技能复用，禁止各写一套 |
| 荒野变形 | 硬编码候选 | 形态选择面板（ Beast 列表 + CR 过滤），选定后套用形态数据面；P5 评估时先出形态面板草图再动工 |
| 极效潜行 | 专用处理器（ctx.skillKey 扩展 AdvantageContext） | 零新弹窗：判定链挂 advantageRules，UI 仅在 CombatAttackModal 优劣势来源清单中呈现（AdvDisadvToggle 已有承载） |
| 守御灵光 | 光环抗性动态结算 | 零新弹窗：伤害结算时在 CombatDamageModal 明细区追加抗性行（数据来源 AuraResolver，P5 设计时定接口） |
| flow 脚本树 damage 节点 | 远程 P0 后续批次 | 复用 DiceInputModal（2.2 通用单值形态），禁止新造 |
| 战技（卓越骰） | 体系线索型资源池批次（§6.3） | 技能使用弹窗复用既有渠道形态（附赠动作指挥/缴械→attack rider + 豁免），池扣减走体系池引用；CombatResourceHud 增池 chips |

原则：P5 批次中「零新弹窗」优先——能在既有弹窗内追加明细行/来源清单的，开新弹窗；确需新弹窗的，先在本档登记形态再实现。

## 4. 收敛规则

1. **同形态第二次出现必须抽通用组件**：DiceInputModal 为先例（HealRollModal 与 aoe 伤害两处同形态后抽取）；新渠道实现时先查 2.2 表，命中既有形态直接复用。
2. **双端组件单文件**：DM/玩家共用的弹窗保持单文件（FeatureCheckModifierModal / FeatureConvTargetModal / HealRollModal 模式），差异走 props，禁止复制分叉。
3. **DOM 锚点随交付登记**：新弹窗交付时在 §1 总表补行（含 testid），探针新增选择器以总表为准。
4. **惯例变更需回写**：本文档 §2 交互惯例若被后续批次修正，同 commit 回写本档与 progress.md。

## 5. 特殊文本记录（战斗日志 / 先攻表格）

技能引擎结算需在战斗日志与先攻表格产出结构化特殊文本，基建已有、格式未规范——本节定约定。

### 5.1 基建现状

- **富文本标记语言**：`src/lib/logRichText.tsx`（渲染器 `renderLogText`）。写入端用轻量标记包裹，渲染端解析为带色片段（标记符号不显示）：《名称》→ 紫（法术/武器/物品名）、【数值】→ 琥珀粗（7、+6、30→12）、关键字着色（击昏/杀死红粗、未命中/施法失败/失败红、豁免通过绿、无效灰）。
- **渲染点 1（先攻表格动作格）**：`InitiativeTable.tsx` 按 `RoundAction`（`types/combat.ts`，combatantId → 本回合动作文本）逐参战者渲染 `renderLogText(action)`——参战者维度。
- **渲染点 2（战斗事件流）**：`CombatEvent`（`types/combat.ts`，最近 50 条随快照广播）kind ∈ attack/move/cast/damage/heal/note，`text` 自然语言摘要驱动回合摘要面板与动画——全局维度。
- **手动入口**：`ManualRecordDialog`（DM 手动记录，含检定成功/失败标记）。

### 5.2 技能结算文本规范

引擎渠道结算落日志时统一按既有标记语言产出，格式模板：

```
《技能名》→ 结算描述（骰值/DC 用【】，结果用关键字）
例：《回气》→ 恢复【12】HP（1d10=7 + 等级【5】）
例：《缴械攻击》→ 消耗卓越骰【1】，目标力量豁免 DC【15】失败，丢弃《长剑》
例：《指挥官奇袭》→ 盟友《游侠A》反应攻击获得加值【1d8】
```

- 技能名一律《》包裹；数值（伤害/恢复/DC/加值）【】包裹；成败用豁免通过/失败关键字。
- **CombatEvent.kind 扩展**：新增 `skill` kind（复用 heal/damage 的数值字段可省，细节全在 text）；兜底可暂投 `note`，P5 批次落地时升级。
- 先攻表动作格（RoundAction）与事件流（CombatEvent.text）同一文本源：结算时双写，参战者格显短摘要、事件流显全摘要，均为同一标记语言的裁剪。

### 5.3 写入责任

- 引擎结算（turnCommitApply / 专用处理器）：结算落账时同步产出标记文本——记账与记录一体，禁止 UI 层事后拼装。
- DM 手动记录（ManualRecordDialog）：文本框旁提供标记速查（或输入提示），保证手写记录与引擎记录同风格。

## 6. 特殊资源双线索模型（战斗面板）

### 6.1 分类定义（用户拍板）

| 类型 | 定义 | 例子 | 池归属 |
|------|------|------|--------|
| **技能线索型** | 池挂在特性自身，每个技能自带次数与重置周期（每长休/短休一次等） | 回气、引导神力、圣疗 | 已实现：特性资源池漏斗（`combatStore` 特性资源池漏斗，池键 `feature:<条目名>`，与 spellSlotChanges 同构，结算并入角色卡 featureUses，SettlementPoolLine 展示 delta/used/max） |
| **体系线索型** | 池独立于特性存在，多个技能共享同一经济池 | 战技：多种战技（指挥官奇袭/缴械攻击/搅乱攻击…），消耗只计算卓越骰（4×战技等级） | 缺位，需新建（§6.3） |

### 6.2 展示落点

- `CombatResourceHud`（现有动作/附赠/移动力三件套悬浮面板）：扩展第二行「池资源 chips」——`池名 剩余/满量`，技能线索型与体系线索型同区混排（数据源见 6.4）。
- `CombatantTraitPanel`（参战者详情）：技能卡上显各自池；体系池在面板顶部独立一行（体系名 + 剩余/满量 + 引用它的技能列表）。
- 玩家端观战投影同步：池属战斗层可见信息，随快照/事件流下发（对齐 CombatResourceHud「DM 端读本地记录、玩家端读观战投影」的共用语义）。

### 6.3 体系池数据模型约定

- 池键命名 `system:<体系名>`（与既有 `feature:<条目名>` 同构、同漏斗结算并入），消耗记录走体系池 delta 而非单特性池。
- spec 引用：战技 spec 带 `poolRef: 'system:卓越骰'`，引擎扣池时按 poolRef 定位，技能自身无池字段——一池多技能。
- 满量公式挂体系定义（卓越骰 = 4×战技等级），随角色卡体系条目（characterOption 特性内嵌选项库，options.json 卓越战技范型已有数据）派生。
- 重置周期随体系定义（卓越骰 = 短休恢复），与技能线索型各自独立声明。
- 结算预览：体系池在 SettlementEntry 增独立行（或并入 featurePools 行但标注体系归属），DM 并入勾选逻辑与 featurePools 同构。

### 6.4 判定规则（新增渠道资源时先归类）

1. 消耗是否被多个技能共享？共享 → 体系线索型（建 `system:` 池）；独占 → 技能线索型（挂特性池）。
2. 池满量是否随某个体系条目等级派生（而非技能自身等级）？是 → 强体系线索信号。
3. 归类存疑时回写本档并问询用户，禁止静默选型。

## 7. 验证关联

- 探针基线：probe-active-skills 96/0、probe-passive2 45/0、probe-reaction 48/0（全量 run.sh ALL PROBES OK）
- 弹窗相关探针段：probe-active-skills 11（aoe 带值/缺省兜底）、14（heal 填骰流）、15a（两步点击信息对话框）、16（op 结构）；probe-passive2 UI-d/e/f（逐卡开对话框）
- 本档为设计文档，随 P5 批次演进；实现落地后在 progress.md 对应批次标注「UI 形态按 ui-design.md §x」
