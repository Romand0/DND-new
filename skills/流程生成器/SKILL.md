# 流程生成器

> 面向 agent 的流程生成工作流：把用户给出的描述性文本解析成机制规格，编排成节点图，生成可直接粘贴进 FlowConsole 的 FlowDefinition JSON，并在人工评审通过后入库。

本技能回答一个问题：给定一段描述性文本，如何产出一份**结构正确、语义忠实、可被人工审查、可通过控制台校验**的流程定义。

---

## 版块 0：适用范围、产物与权威来源

### 0.0 阶段背景：工具箱建设期，保持引擎意识

当前处于**法术流程开发的初期**：真实法术的效果内容远超预设节点所能涵盖的范围。这是一个**边添加流程、边完善工具箱**的过程——每接一个新法术，都是对现有节点/引擎能力边界的一次探测。因此约定：

1. **机制超出节点能力 ≠ 只能 custom 占位**。先依次评估：(a) 该机制是否是某个通用能力的一个实例（如「对部分伤害类型抗性」是伤害修饰引擎的一个参数组合）？(b) 现有节点加一个配置字段能否覆盖？(c) 是否值得为此新增节点类型（§4 门槛）？
2. **引擎优先，实例最小化**：能参数化进节点配置/引擎实例的，写入通用载体——statusLibrary 只注册 `damage_affinity` 一条通用伤害修饰状态，具体抗什么/来源限不限/持续多久全部由流程节点配置注入实例；为单个法术在工具箱里开专用条目属于硬编码反模式。
3. **必要时应与用户讨论**：遇到节点覆盖不了的机制，向用户说明差距与候选方案（配置扩展 / 引擎扩展 / 新节点类型 / custom 占位），共同决定工具箱演进方向后再动代码，避免单方面替工具箱定型。
4. **回填文档**：每次为工具箱新增能力后，同步更新本文档（§0.5 运行成熟度 / §2.1 节点目录 / §3.1 配置契约），保持「代码 = 权威真相」与文档一致。

### 0.1 何时使用

- 用户给出一段描述性文本，要求「写成流程 / DSL / 节点图 / 可在控制台创建」。
- 用户给出的是**法术名**（而非文本）且目的为生成流程 → 转 `skills/法术流程流水线/SKILL.md`，由其编排不全书搜索取原文并完成法术库绑定确认后回到本 skill 版块 1。
- 用户要求修改已发布流程的机制（增删节点、改配置、加分支）。
- 用户要求新增节点类型或边类型，并接入可视化编辑器与编译器。

### 0.2 每次任务的交付物

| 交付物 | 说明 | 模板 |
|--------|------|------|
| 机制规格表 | 从原文抽取并归一化的字段清单，含「待人工确认项」 | `templates/spell-spec.md` |
| FlowDefinition JSON | 单个对象或数组，可直接粘贴进 FlowConsole | `templates/flow-definition.example.json` |
| 流程 description | 按公式生成：[施法时间]，[射程]，[成分]，[判定/目标]，[结果] | 见 §2.1.1 |
| 自审报告 | 通过/失败项、风险项、待确认项 | `templates/review-checklist.md` |
| （仅扩展任务）节点类型契约 | 新类型的字段、不变量、输出、失败模式 | `templates/new-node-type-contract.md` |

**FlowConsole 发布校验必填项**（`src/utils/flow-validation.ts`，缺任一即被发布门禁拒绝，JSON 交付前逐项自检）：

- 顶层：`id`（字符串，前缀须与 `category` 一致，如 `spell:xxx`）、`name`、`description`、`category`（`spell` / `class_features` / `custom` 之一）
- 每个节点：`id`、`type`、`label`（中文字符串，画布显示名）、`position`（缺坐标仅警告，但建议带上）
- 每条边：`id`、`from`、`to`、`trigger`
- `position` 缺失会触发「打开编辑器时自动布局」警告；`label` 与 `category` 缺失是硬错误

### 0.3 权威来源金字塔

冲突时，上层覆盖下层：

1. **运行真相**：`src/lib/flowCompiler.ts` —— 节点实际读取哪些配置、实际写出什么。
2. **模式真相**：`src/types/flow.ts` —— `FlowNodeType` / `NODE_TYPE_REGISTRY` / `NODE_CONFIG_SCHEMA`。
3. **门禁真相**：`src/utils/flow-validation.ts`（控制台发布校验）、`src/utils/flow-editor/validation.ts`（编辑器校验）、`src/types/flow.ts` 的 `validateFlow`。
4. **入库路径**：`src/components/FlowConsole.tsx` + `src/data/flowStore.ts` 的 `publishDirect`。
5. **散文参考**：`docs/nodes/*.md` —— 逐节点说明，可能滞后于代码。

### 0.4 已知的文档与代码差异（编写时按代码）

`docs/nodes/*.md` 描述的是设想态字段，运行时读取的是另一套键名。以下差异必须按右列执行：

| 节点 | docs/nodes 写的键 | 代码实际读取的键 |
|------|------------------|------------------|
| cast_start | `autoChecks.components.enabled` 等嵌套结构 | `autoChecks.components`（布尔）、`autoChecks.range`、`autoChecks.time`；另有 `overrideComponents/overrideRange/overrideTime` |
| select_target | `targetType` / `targetCount` | `mode` / `maxCount` |
| saving_throw | `saveAbility` / `saveDC` | `ability` / `dc` |
| apply_effect | `effectName` / `duration` / `magnitude` / `stackable` | `effectType` / `value` / `damageType` |
| condition_branch | `branches` / `defaultBranch` / `timeout` | `condition` |
| attack_roll | `attackBonus` / `targetAC` / `criticalRange` 等 | 无配置，运行时硬编码加成 5、AC 15 |
| concentration_check | `dc` / `damageHalf` | 无配置，运行时硬编码体质 DC 10 |

`docs/nodes` 额外收录了 `apply_damage`，它**不在** `FlowNodeType` 联合类型里，属于无效类型，不要在图里使用。伤害统一用 `apply_effect` + `effectType: "damage"`。

### 0.5 运行成熟度（编写时的现实约束）

以当前代码为准（本节更新于 2026-10-21，Phase 3 战斗接入之后）：

- `FlowCompiler.executeFlow` **按边遍历整张图**：从 `cast_start` 出发，按出边 `trigger` 匹配结果状态（on_success/on_failure/on_partial/on_true/on_false/on_complete）深度优先推进；每节点至多执行一次（visited 防环），执行轨迹逐节点写入 `context.log`（FlowLogEntry），节点输出缓存进 `context.results`。多目标判定节点（saving_throw / attack_roll）的状态反映聚合结果：全成=success、全败=failure、混合=partial，使分流边真实可用。
- `condition_branch` 已接入白名单安全求值器（`src/lib/flowExpression.ts`，替代裸 eval）；作用域注入 `state` / `results` / `spell` / `caster` / `targets` / `prev`。`custom` 节点保留 eval 逃逸舱（风险自负）。
- 数值缺陷已修：`saving_throw` 属性调整值按 `AbilityScore.score` 重算（旧代码对象减法得 NaN 恒失败）；`attack_roll` 加值走 `getSpellAttackBonus`、目标 AC 读参战者 `ac`（角色卡 `armorClass` 兜底），自然 20 必中 / 自然 1 必失；`apply_effect` 骰式 `NdM+K` 完整投掷（旧代码 8d6 只掷一颗），一次掷骰全目标共用；`concentration_check` 体质调整值同款修复。
- `cast_start` 距离检查：施法者与目标均有沙盘位置（`context.positions`）时按切比雪夫 × 5 尺真实校验；缺位置数据时跳过并标注 `assumed: true`。
- **战斗接入已通（Phase 3 核心）**：`CombatSpellModal` 选定法术时按 spellId 查绑定 → 有绑定正式流程（`flowStore.getPublished`，本地缓存缺失自动 `pullRemote`）→ 进入「按流程施放」（`src/components/combat/FlowRunStep.tsx`）→ 组装 `FlowExecutionContext`（casterId/targets = 参战者 id、`combatants` 身份映射、positions = 沙盘）执行 → 逐节点日志渲染 → 确认后经 `onFlowResolved` 由 `CombatSession` 回写逐目标参战者 HP + 按施法时间扣动作 + 先攻表格摘要。**编译器纯计算不落库**：HP 变化只进 results（oldHp/newHp），重复执行不叠加扣血。
- **手动骰源（现场投骰）**：`executeFlow(flow, context, diceSource?)` 第三参为骰源钩子（`FlowDiceSource`）——编译器在每次 d20 检定（save/attack/concentration，逐目标）与效果骰组（apply_effect / scaled_effect，一次掷骰全目标共用）前向骰源要值；骰源返回合法值（1-20 / 长度 = count 且 1..sides 的数组）则采用，返回 null 回落自动掷。FlowRunStep 默认手动模式：每个骰暂停弹出输入面板（d20 单框 / 效果骰逐颗框），旁挂「自动掷」按钮（resolve null），顶部开关可切回全自动。日志中手动骰值带「（手动）」标记。
- **身份映射语义**：`context.combatants` 存在时 id 即参战者 id——纯 NPC 参战者豁免 = 属性调整值 + 熟练属性 × 熟练加值（读参战者六维/proficientSaves/proficiencyBonus），AC 读 `combatant.ac`，HP 读参战者；PC 参战者经 characterId 回落角色卡（getSaveBonus / getSpellSaveDC / getSpellAttackBonus）。无映射（非战斗场景）时 id 直接当角色卡 ID（旧行为）。NPC 施法者启发式：DC = 8 + 熟练加值 + 精神三维最大调整值；法术攻击加值同款。
- 因此一份流程的价值是：**可评审、可校验、可视化、可绑定、可独立跑通执行轨迹、可在战斗中一键施放**的结构化机制规格。

编写时按此现实表述：把节点图当作「精确且可审查的规格」来写，并对每个节点标注它是否已有运行支撑（见 §5 自审）。不要把「图上有这个节点」等同于「运行时已经实现该机制」。

---

### 0.6 战斗施放的边方向语义（易错）

检定节点的 status 聚合语义决定分流方向，**接反了会在「豁免成功」时造成伤害**：

- `saving_throw`：全部目标**豁免通过** = status `success`；全部**未通过** = `failure`。因此「豁免失败才受伤」的标准伤害拓扑是：
  - `saving_throw` —`on_failure`→ 效果节点（scaled_effect / apply_effect）
  - `saving_throw` —`on_success`→ `cast_end`（豁免通过，法术无效）
- `attack_roll`：全部**命中** = `success`。伤害拓扑：`attack_roll` —`on_success`→ 效果节点，`on_failure`→ `cast_end`。
- FlowRunStep 逐节点日志会显示每个目标的 d20/加值/DC/通过与否与 HP 变化行，接反方向在预演时会立刻显形。

---

## 版块 1：输入解析 —— 从法术文本到机制规格

### 1.1 抽取清单

对输入文本逐项抽取。抽不到就留空并记入「待确认」，不要臆造数值。

| 规格项 | 归一到 | 用途 |
|--------|--------|------|
| 法术名 | `name` | 流程名称、slug |
| 环级 | `level`（0 表示戏法） | 判定类别、是否升环分支 |
| 施法时间 | `castingTime` | 映射 `cast_start.overrideTime` |
| 射程 | `range`（数字或「自身/触及」） | 映射 `cast_start.overrideRange` |
| 成分 | `components` 的 V/S/M 布尔 | 映射 `cast_start.autoChecks.components` |
| 目标 | 自身/单体/多体/区域 | 映射 `select_target.mode` + `maxCount` |
| 检定 | 攻击检定 或 属性豁免 | 决定 `attack_roll` 与 `saving_throw` |
| 豁免属性 | strength..charisma | `saving_throw.ability` |
| 伤害骰 | `XdY+Z` | `apply_effect.value` |
| 伤害类型 | 映射到 13 种 DSL 值 | `apply_effect.damageType` |
| 半伤 | 豁免成功是否减半 | 影响边与效果说明 |
| 效果类别 | 伤害/治疗/状态 | `apply_effect.effectType` |
| 持续与专注 | 时长、是否专注 | 是否需要 `concentration_check` |
| 升环 / 戏法缩放 | 分档取值表 | 用 `scaled_effect`（见 2.3，禁分支链） |
| 特殊分支 | 阈值、条件、二次选择 | 决定分支节点与边 |

> **戏法缩放陷阱**：戏法（level 0）的伤害提升按**施法者角色等级**（5/11/17 级），与环位无关——法术描述「当你到达 5 级时」指角色等级。数值分档一律用 `scaled_effect` 节点（`scaleBy: "caster_level"`）；只有手写 `condition_branch` 条件时才写 `caster.level >= N`（scope 已注入完整施法者 Character），写 `spell.level >= N` 恒为 false（戏法环级永远是 0），伤害永远取基础骰。升环施法（有环位法术用更高环位施放）用 `scaled_effect` 的 `scaleBy: "spell_level"`。

### 1.2 归一化规则

- **属性名**：文本「敏捷」→ `dexterity`；「体质」→ `constitution`；映射表见 `src/types/flow.ts` 的 `select` 选项。
- **伤害类型**：中文「火焰」→ `fire`；「黯蚀」→ `necrotic`；可选值以 `NODE_CONFIG_SCHEMA.apply_effect.damageType.options` 为准。
- **骰子**：保留原始表达式 `8d6`、`3d8+5`；不要展开成期望值。
- **射程**：抽出数字（`60尺` → `60`）；「自身」记 0 或留空。
- **成分**：V/S/M 布尔；材料不参与运行时判定。
- **DC**：**留空 `""`**（运行时自动取施法者法术豁免 DC，随施法者实时变化）。法术文本从不印 DC，只有施法者才知道自己的豁免 DC——推定写死是错误来源。仅当效果文本明确给出固定 DC（如某些物品/区域效果「DC 15」）才写数字字符串；避免模板变量（`parseInt` 得 `NaN` 回落 10）。

### 1.3 歧义处理策略

1. 数值缺失：写占位值并在自审报告中列为待确认，例如「DC 未给出，暂按施法者法术豁免 DC」。
2. 文本有歧义：给出你的首选解释 + 备选解释，让人类在评审时定夺。
3. 机制超出节点能力（如强制位移、区域持续地形）：用 `custom` 节点占位并注明，或记入「需要新节点类型」，不要硬塞进不匹配的节点。

### 1.4 关键原则：不要重复法术元数据

流程通过 `spellId`（流程级）或绑定关系关联法术；`cast_start` 在运行时用 `context.spellId` 从法术库取施法时间、射程、成分。因此：

- 只有**需要覆盖**法术默认值时才填写 `overrideComponents/overrideRange/overrideTime`。
- 不要在节点配置里抄一遍射程与施法时间，避免两处数据漂移。

---

## 版块 2：机制建模 —— 节点与边

### 2.1 节点目录（10 种，以 `FlowNodeType` 为准）

| 类型 | 语义 | 入口/出口 | 运行支撑 |
|------|------|-----------|----------|
| `cast_start` | 施法开始 + 前置检查（成分/射程/时间） | 流程入口，通常唯一 | 有（射程按沙盘位置真实校验，无位置跳过；时间恒可用） |
| `select_target` | 目标选择与数量校验 | 接在 cast_start 后 | 有（数量校验） |
| `saving_throw` | 属性豁免检定 | 产生成功/失败分流 | 有（真实调整值+熟练加值；NPC 目标待 Phase 3） |
| `attack_roll` | 法术攻击检定 | 产生命中/未命中分流 | 有（真实加值/AC + 自然 20/1；NPC 目标待 Phase 3） |
| `condition_branch` | 条件分流 | 必须有两个出口 | 有（白名单安全求值器） |
| `apply_effect` | 伤害/治疗/状态结算 | 效果终点 | 有（完整 NdM+K 掷骰；status 走通用伤害修饰引擎已可落地，见 §3.1） |
| `scaled_effect` | 分级效果：按施法者角色等级或法术环位自动取值的伤害/治疗 | 效果终点 | 有（分档表取档 + 掷骰；一次掷骰全目标共用） |
| `concentration_check` | 专注检定（体质 DC 10） | 持续法术收尾 | 有 |
| `cast_end` | 流程收尾 | 流程出口 | 有（仅日志） |
| `custom` | 开放扩展 | 任意 | 有（eval，风险自负） |

#### 2.1.1 流程 description 生成方法

**目标**：为 DM 提供即时决策支持，而非详细说明。

**公式**：`[施法时间]，[射程]，[成分]，[判定/目标]，[结果]`

**示例**：
- "1 动作，60 尺，V，感知豁免，失败受 3d6 心灵伤害并全速远离，成功伤害减半不远离"
- "1 动作，自身，S，目标敏捷豁免 DC13，失败受 2d8 力量伤害并倒地"
- "1 反应，30 尺，V，单体，造成 3d6 酸伤害"

**要点提炼**：
1. **施法时间**：1 动作/1 反应/1 分钟 等
2. **射程**：数字尺/自身/触及/特定范围
3. **成分**：V（言语）/S（姿势）/M（材料）
4. **判定类型**：法术攻击/豁免属性/无判定
5. **结果**：失败结果，成功结果（如适用）

**原则**：
- 省略描述性文字，保留决策关键字
- 多步骤结果用"并"连接，保持一行
- 无判定时省略，直接写结果
- 伤害类型用关键词（火焰/酸/雷电/力量等）

### 2.2 边目录（`EdgeTrigger`）

| trigger | 语义 | 使用场景 |
|---------|------|----------|
| `on_complete` | 上游完成后无条件进入 | 默认，线性串联 |
| `on_success` | 上游成功 | 豁免通过、检定通过后的分流 |
| `on_failure` | 上游失败 | 失败后的分流 |
| `on_partial` | 部分成功 | 半伤等中间态 |
| `on_true` | 条件为真 | `condition_branch` 必备出口 |
| `on_false` | 条件为假 | `condition_branch` 必备出口 |

### 2.3 可直接复用的拓扑配方

线性直伤 + 敏捷豁免：

```
cast_start → select_target → saving_throw → apply_effect(damage) → cast_end
```

法术攻击：

```
cast_start → select_target → attack_roll → apply_effect(damage) → cast_end
```

治疗：

```
cast_start → select_target → apply_effect(healing) → cast_end
```

控制/状态：

```
cast_start → select_target → saving_throw → apply_effect(status) → cast_end
```

持续/专注：

```
cast_start → select_target → apply_effect(status) → concentration_check → cast_end
```

**分级缩放（戏法按角色等级 / 升环按环位）——用 `scaled_effect`，禁止分支链**：

```
cast_start → select_target → saving_throw → scaled_effect → cast_end
```

`condition_branch` 只表达**判定/状态**分流（豁免成败、HP 阈值）。数值随等级/环位线性分档属于**取值**逻辑，用 `scaled_effect` 的分档表表达；用分支链拆 4d4/3d4/2d4/1d4 是反模式（节点爆炸、改档位要同步改边）。

`scaled_effect` 配置契约（以 `NODE_CONFIG_SCHEMA.scaled_effect` 为准）：

- `scaleBy`：`caster_level`（戏法缩放，读施法者角色等级）| `spell_level`（升环施法，读当前法术环位）
- `tiers`：分档表 `{ level: number; value: string }[]`，**建议按 level 从高到低排列**；执行时取首个「缩放值 ≥ level」的档（等价于最大可用档），全部不命中回落最低档
- `effectType`：`damage` | `healing`（状态不分档，仍走 `apply_effect`）
- `damageType`：可选，同 `apply_effect.damageType` 映射

示例——恶言相加（戏法，角色等级缩放）：

```json
{
  "id": "scaled_dmg",
  "type": "scaled_effect",
  "config": {
    "scaleBy": "caster_level",
    "tiers": [
      { "level": 17, "value": "4d4" },
      { "level": 11, "value": "3d4" },
      { "level": 5,  "value": "2d4" },
      { "level": 1,  "value": "1d4" }
    ],
    "effectType": "damage",
    "damageType": "psychic"
  }
}
```

输出字段：`scaleBy / scaleValue / scaleSource / matchedTier / tiers / dice / results`（`scaleSource` 是人类可读的取值来源说明，直接进运行日志）。

带条件分流（升环、阈值）：

```
... → condition_branch ─(on_true)→ 分支 A ─┐
                       └(on_false)→ 分支 B ─┴→ cast_end
```

### 2.4 硬性图规则（违反即不可发布）

- 至少一个 `cast_start`；建议恰好一个。
- 每条边 `from` / `to` 必须指向存在的节点。
- `condition_branch` 必须同时有 `on_true` 与 `on_false` 出边。
- 禁止自环（`from === to`）。
- 禁止平行边（同一 `from → to` + 同一 `trigger` 重复）。
- 每个节点都应可达；孤立节点会被校验器标记。
- 节点 ID 与边 ID 全局唯一。
- 不得使用 `apply_damage`（非合法类型）。

### 2.5 建模原则

- **一个节点承载一个机制原子**。多个机制混合时拆成多个节点。
- **优先线性**，仅当原文存在真实分流时才引入分支。分支让图更难评审。
- **因果方向一致**：边从「判定」指向「结果」，从「结果」指向「收尾」。
- **语义命名**：节点 ID 用 `snake_case` 且表意，如 `save_dex`、`damage_fire`；边 ID 用 `edge_<from>_<to>_<trigger>`。

---

## 版块 3：属性设置规范

### 3.1 节点配置（以代码读取为准）

`cast_start`

| 键 | 类型 | 必填 | 说明 |
|----|------|------|------|
| `autoChecks` | object | 是 | 必须存在，否则运行时报错。含 `components` / `range` / `time` 三个布尔 |
| `overrideComponents` | string | 否 | 如 `"verbal,somatic"` |
| `overrideRange` | number | 否 | 覆盖射程 |
| `overrideTime` | select | 否 | `1 action` / `1 bonus action` / `1 reaction` / `1 minute` / `10 minutes` / `1 hour` |

```json
"config": { "autoChecks": { "components": true, "range": true, "time": true } }
```

`select_target`

| 键 | 类型 | 必填 | 可选值 |
|----|------|------|--------|
| `mode` | select | 是 | `self` / `single` / `multi` / `area` |
| `maxCount` | number | 是 | 正整数字面量，如 `1`、`3` |

`saving_throw`

| 键 | 类型 | 必填 | 说明 |
|----|------|------|------|
| `ability` | select | 是 | `strength` / `dexterity` / `constitution` / `intelligence` / `wisdom` / `charisma` |
| `dc` | string | 是 | **留空 `""` = 施法者法术豁免 DC**（运行时取 `characterStore.getSpellSaveDC(施法者)`，推荐）；显式数字字符串 = 固定 DC，如 `"15"`；非法数字回落 10 |

`apply_effect`

| 键 | 类型 | 必填 | 说明 |
|----|------|------|------|
| `effectType` | select | 是 | `damage` / `healing` / `status` |
| `value` | dice/string | 是 | `8d6`、`3d8+5`；status 路径不读骰，传 `"0"` 占位 |
| `damageType` | select | 否 | 13 种伤害类型之一；damage/healing 路径参与抗性结算（resolveDamage） |
| `affinityKind` | select | status 必填 | `resistance`（减半）/ `immunity`（归零）/ `vulnerability`（翻倍）——通用伤害修饰引擎的修饰方向 |
| `damageTypes` | text | 否 | 逗号分隔英文键（如 `bludgeoning,piercing,slashing`）；留空 = 全部类型 |
| `sourceKind` | select | 否 | `""`（不限）/ `weapon` / `spell` / `effect`——限定伤害来源（如剑刃防护仅武器） |
| `durationRounds` | number | 否 | >0 按回合计时自动消退（约 6 秒/回合近似）；0/缺省 = 直到手动解除 |

**status 落地链路**（已实装）：节点配置 → 编译器产出待落地记录（statusId 固定 `damage_affinity` + 实例级 Effect，纯计算不落库）→ 战斗确认侧 `globalStatusManager.applyEffect` 写入实例 → `combatAffinities` 合并进伤害结算。任意伤害类型/来源组合直接配节点参数，状态库与编译器零改动（§0.0 引擎意识的落地样例）。

`condition_branch`

| 键 | 类型 | 必填 | 说明 |
|----|------|------|------|
| `condition` | string | 是 | 条件表达式；当前运行时作用域有限，尽量用简单比较 |

`custom`

| 键 | 类型 | 必填 | 说明 |
|----|------|------|------|
| `code` | string | 否 | 自定义脚本；运行时 `eval` |

`attack_roll`、`concentration_check`、`cast_end`：无配置字段。传入额外键不会报错，但运行时忽略；建议留空 `config`。

### 3.2 边属性

| 键 | 必填 | 规范 |
|----|------|------|
| `id` | 是 | `edge_<from>_<to>_<trigger>` |
| `from` / `to` | 是 | 存在的节点 ID |
| `trigger` | 是 | 见 §2.2；线性串联用 `on_complete` |
| `label` | 否 | 中文短标签，如「成功」「失败」「半伤」 |
| `dataMap` | 否 | 上下游输出的字段映射；当前声明性使用 |
| `condition` | 否 | 守卫条件；当前声明性使用 |

### 3.3 位置与布局

不提供坐标也可（编辑器会 `ensureNodePositions` 自动布局），但控制台创建的图建议给出坐标以便阅读。按拓扑层级递推：

```
startX = 100, startY = 100, spacingX = 200, spacingY = 150
第 0 层 y=100；第 1 层 y=250；同层 x 依次 +200
```

### 3.4 流程级字段（控制台入库要求）

| 字段 | 必填 | 规范 |
|------|------|------|
| `id` | 是 | 与 `category` 前缀一致：`spell:` / `class_features:` / `custom:` |
| `name` | 是 | 中文显示名，作为控制台更新/删除的匹配键，必须唯一 |
| `description` | 是 | **非空字符串**。控制台校验要求 `description` 为真值，空串会失败 |
| `category` | 是 | `spell` / `class_features` / `custom` |
| `nodes` / `edges` | 是 | 数组 |
| `tags` | 否 | 字符串数组 |
| `version` | 否 | 控制台创建时自动置 1，更新时自增 |

---

## 版块 4：扩展 —— 创建新的节点类型 / 边类型

### 4.1 决策门槛

新增类型会同时改动类型层、编译器、编辑器、校验器、文档。只有当现有 9 种节点无法表达该机制原子时才做。可先用 `custom` 占位并记录需求。

### 4.2 新增节点类型：改动清单

1. `src/types/flow.ts`
   - `FlowNodeType` 联合类型加入新成员。
   - `NODE_TYPE_REGISTRY` 加入元信息（`type` / `label` / `description` / `category` / `color` / `defaultConfig` / `icon`）。
   - `NODE_CONFIG_SCHEMA` 加入字段数组；复杂配置可新增独立 `XxxConfig` 接口。
2. `src/lib/flowCompiler.ts`
   - `executeNode` 的 `switch` 加入 `case`。
   - 实现 `execute<Type>Node(node, context)`，明确返回 `NodeExecutionResult`。
   - 所需运行态数据从 `FlowExecutionContext` 取，避免隐藏的全局依赖。
3. `src/utils/flow-editor/node-icon.tsx`：若用新图标，在 `resolveNodeIcon` 补映射。
4. 校验器：若有不变量（必填配置之外的结构约束），在 `src/utils/flow-validation.ts` 与 `src/utils/flow-editor/validation.ts` 同步补充。
5. `docs/nodes/<type>.md`：按现有文档格式补一篇。
6. 验证：`npx tsc --noEmit` 与 `npm run build` 通过；在编辑器里能拖出、能配、能存、能发布。

### 4.3 新增边类型：改动清单

1. `src/types/flow.ts` 的 `EdgeTrigger` 联合类型加入新成员。
2. 触发时机标签映射：`src/components/flow-editor/presentation/properties/EdgeTriggerSelector.tsx`、`EdgePropertiesPanel.tsx`，以及 `src/pages/FlowEditor.tsx` 内的标签表。
3. 校验器：在 `src/utils/flow-editor/validation.ts` 与 `src/types/flow.ts` 的 `validateFlow` 补充该 trigger 的约束。
4. 画布可视化：`FlowCanvasArea.tsx` 若按 trigger 区分线型，需同步。
5. 验证：同 §4.2 第 6 步。

### 4.4 扩展契约

填写 `templates/new-node-type-contract.md`，至少覆盖：输入字段与校验、输出字段、不变量、副作用、失败模式、是否需要人工评审运行语义。契约未写清前不要提交改动。

### 4.5 兼容性原则

- 已发布流程的键名语义保持稳定。新版本引入新键，旧键继续可读。
- 避免改已存在 `FlowNodeType` 成员的字符串值。
- 删除或重命名类型属于破坏性变更，需要人工评审与迁移方案。

---

## 版块 5：自审 —— 审查清单与达标标准

自审分五道门。任何一道失败都不得进入人工评审。

### 5.1 门 A：结构合法（机器可查）

对照 `src/utils/flow-validation.ts`（控制台门禁）与 `src/utils/flow-editor/validation.ts`（编辑器门禁）。重复边、自环、孤立节点等规则在编辑器门禁中为错误，在控制台门禁中为警告：

- `id` / `name` / `description` 均为非空字符串。
- `category` 属于三类；`id` 前缀与 `category` 一致。
- `nodes` / `edges` 为数组；节点含 `id` / `type` / `label`；边含 `id` / `from` / `to` / `trigger`。
- 至少一个 `cast_start`。
- 无重复节点 ID、无重复边 ID、无自环、无平行边。
- `condition_branch` 同时具备 `on_true` 与 `on_false`。
- 无孤立节点，全部可达。

### 5.2 门 B：语义忠实

- 规格表中每一项机制在图上都有对应节点或边。
- 图上没有规格表之外的多余机制。
- 目标的「自身/单体/多体/区域」与 `select_target.mode` 一致。
- 判定路径正确：攻击用法术攻击，豁免用对应属性豁免。
- 骰子、伤害类型、半伤、持续与专注逐项对照。

### 5.3 门 C：配置完整

- 每个节点所需键都存在，键名与 §3.1 完全一致。
- `cast_start.config.autoChecks` 存在。
- `saving_throw.dc` 是数字字符串。
- `select_target.maxCount` 是数字。
- 提供了坐标，且布局可读。
- 没有把 `docs/nodes` 的旧键名（如 `targetType`、`saveDC`）写进 JSON。

### 5.4 门 D：运行现实核对

对每个节点标注当前运行支撑，并在报告中写出（Phase 2 后）：

| 节点 | 运行时行为 | 风险 |
|------|-----------|------|
| `saving_throw` | 调整值按 AbilityScore.score 重算，PC 走 getSaveBonus 熟练豁免 | NPC 目标（非 Character）查不到，Phase 3 身份映射解决 |
| `attack_roll` | 加值走 getSpellAttackBonus，AC 读 target.armorClass，自然 20/1 特判 | 目标无 armorClass 字段时回退 15 |
| `apply_effect` | parseDice 完整解析 NdM+K，一次掷骰全目标共用；伤害路径接 resolveDamage 抗性结算 | 不与检定结果联动（半伤/暴击按 halfDamageOnSave 配置） |
| `apply_effect(status)` | 通用伤害修饰引擎：产出待落地记录，确认时经 globalStatusManager.applyEffect 写入实例（实例级 effects + durationRounds），combatAffinities 合并结算；advanceRound/读时惰性过期双保险清理 | expiresAt 按现实时间近似回合；状态暂无独立徽标 UI |
| `condition_branch` | 白名单求值器（flowExpression），未知变量/语法错误 → failure | 仅支持只读表达式，无赋值/调用 |
| `cast_start` | 有沙盘位置时切比雪夫真实距离校验；无位置跳过并标 assumed | 施法时间恒可用（动作消耗 Phase 3 接入） |
| `concentration_check` | 体质调整值按 score 重算，DC 10 | dc 配置键不存在（§0.4），固定 10 |
| 边遍历 | 已实现：trigger 匹配 + visited 防环 + 日志落 context.log | 多目标混合结果走 on_partial 边；dataMap 仍为声明性 |

若某个机制完全依赖尚未实现的运行支撑，在报告中明确写「图已表达，运行未实现」，交由人类决定是否入库。

### 5.5 门 E：人工预演（由人类执行）

- 在流程列表页打开控制台，粘贴 JSON，选择创建模式执行。
- 或导入编辑器，点击自动修复，确认无错误后预览。
- 检查运行结果与规格是否一致。

### 5.6 达标标准与常见失败

| 标准 | 通过条件 | 常见失败 |
|------|----------|----------|
| 可发布 | 门 A 全绿 | 缺 `cast_start`；`description` 为空；ID 前缀与类别不符 |
| 可读 | 布局分层、ID 表意 | 节点坐标全为 0；ID 用 `n1`/`n2` |
| 忠实 | 门 B 无缺项无多项 | 把豁免法术写成攻击检定 |
| 可运行 | 门 C 全绿 | 漏 `autoChecks`；DC 写成模板变量 |
| 透明 | 门 D 已标注 | 把占位节点当作已实现机制 |

### 5.7 自审报告

用 `templates/review-checklist.md` 逐项打勾，附上待确认项与运行风险，随 JSON 一并交给人类。机器校验只是下限，规则解释与游戏机制正确性由人类定夺。

---

## 版块 6：人机协作与职责分工

### 6.1 基本原则

**入库前必须经过人工检查。** Agent 负责生产与自审，人类负责审定与入库。Agent 在任何情况下都不自行发布、不绑定法术、不写数据库。

### 6.2 职责表

| 环节 | Agent | 人类 |
|------|-------|------|
| 解析法术文本 | 抽取、归一化、列出待确认 | 确认歧义与缺失数值 |
| 机制建模 | 选节点、连边、定分流 | 审定游戏机制正确性 |
| 属性设置 | 按 schema 填配置、给坐标 | 抽查关键数值 |
| 自审 | 跑门 A–D、写报告 | 执行门 E 预演 |
| 入库 | 提供 JSON 与报告，等待 | 在控制台执行创建/更新/删除 |
| 绑定法术 | 不参与 | 在控制台中绑定/解绑 |
| 扩展节点类型 | 改代码、写契约、跑构建 | 审定语义与兼容性 |

### 6.3 交接产物格式

Agent 的最终消息包含四段，顺序固定：

1. `机制规格表`（Markdown 表格）
2. `FlowDefinition JSON`（```json 代码块，单个对象或数组）
3. `自审报告`（通过项、待确认项、运行风险）
4. `待人工操作`（在控制台选择哪个模式、粘贴什么、确认什么）

### 6.4 明确禁止

- 调用 `flowStore.publishDirect`、`apiFetch('/flows/...')` 或其他写接口。
- 直接修改本地已发布缓存、D1 数据、绑定关系。
- 未经人类明确指示执行删除模式。
- 把「已通过静态校验」表述为「机制已验证正确」。

---

## 版块 7：模板索引

| 模板 | 用途 | 路径 |
|------|------|------|
| 机制规格表 | 解析阶段的中间产物 | `templates/spell-spec.md` |
| FlowDefinition 示例 | 可粘贴的完整 JSON 样例 | `templates/flow-definition.example.json` |
| 自审清单 | 门 A–E 逐项检查 | `templates/review-checklist.md` |
| 节点类型契约 | 扩展任务的设计契约 | `templates/new-node-type-contract.md` |

---

## 版块 8：现有资源索引（整合入口）

| 资源 | 路径 | 用途 |
|------|------|------|
| 节点散文文档 | `docs/nodes/README.md`、`docs/nodes/<type>.md` | 逐节点背景，注意 §0.4 差异 |
| 类型与 Schema | `src/types/flow.ts` | 节点/边类型、注册表、配置 Schema、校验 |
| 运行编译器 | `src/lib/flowCompiler.ts` | 各节点实际读取的配置与行为 |
| 控制台发布校验 | `src/utils/flow-validation.ts` | 入库门禁的精确条件 |
| 编辑器校验与自动修复 | `src/utils/flow-editor/validation.ts`、`src/components/flow-editor/hooks/use-auto-fix.ts` | 编辑器内错误与修复建议 |
| 控制台组件 | `src/components/FlowConsole.tsx` | 创建/更新/删除三模式与 JSON 格式 |
| 存储与发布 | `src/data/flowStore.ts` | `import` / `publishDirect` / 草稿与发布态 |
| 法术绑定 | `src/services/bindingService.ts` | 流程与法术的绑定关系 |
| 生成文档 | `docs/generated/src/types/flow.md`、`docs/generated/src/data/flowStore.md` | 快速概览 |
