# 搜索（Search）动作设计

## 1. 规则依据（SRD 5.1 / PHB 2014）

- Search 动作（PHB p.193）：「投入注意力寻找某物」，由 DM 决定使用**感知（察觉）**还是**智力（调查）**检定。
- Hiding（PHB p.177）：「躲藏时做敏捷（隐匿）检定；在你被发现或停止躲藏之前，**该检定的总值**会被任何**主动搜寻你踪迹**的生物以感知（察觉）检定对抗。」
- 被动察觉：仅在「未被主动搜寻」时用于发现，公式 `10 + 修正值`（优势 +5 / 劣势 -5）。
- Contests（PHB p.174）：比较双方总值，高者胜；**平局时局面维持原状**。
- 动作经济：Search 消耗一个动作，规则未规定失败退还。

规则推导：

1. 躲藏必须落下一个**数值**（隐匿总值），否则无法对抗 → hidden 实例携带 `stealthTotal`。
2. 搜人 = 察觉检定对抗隐匿总值，属于机械判定，无裁量空间 → 走 `search` op，不走 `decision_request`。
3. 平局 → 仍处于躲藏（判定条件 `searchTotal > stealthTotal`）。
4. 搜寻失败照扣 1 动作。
5. Search 本身无射程规定 → 全图搜索（房规不做距离闸门）。

## 2. 已定决策（用户确认）

| 决策点 | 结论 |
|---|---|
| 首版对象 | 只做搜人（对抗活跃 hidden 实例）；搜物/搜线索留待 DM 用 `check-request` 自设 DC |
| 隐匿值缺失 | 用户可见入口（DM 按钮 / 玩家按钮 / 躲藏裁定）**强制录入**；特性转换无掷骰环节，按被动隐匿 `10 + 隐匿加值` 代填并标注估算 |
| 距离/范围 | 全图无限制 |
| 结果反馈 | 只回「发现 / 未发现」，不暴露对抗差值；平局归入「未发现」 |

## 3. 数据模型

### 3.1 hidden 实例携带隐匿总值

`StatusInstance.metadata` 已有槽位（`types/status.ts:175`），补两个键：

```ts
metadata: {
  stealthTotal: number;              // 躲藏时掷出的隐匿检定总值
  stealthSource?: 'roll' | 'passive'; // roll=实际掷骰；passive=特性转换按被动代填
}
```

`statusManager.applyEffect` 增加可选 `metadata?: Record<string, any>`，与 definition/combatantPatch 合并写入实例。

### 3.2 search op

```ts
| {
    kind: 'search';
    d20: number;        // 玩家线下掷骰骰面
    bonus: number;      // 察觉技能加值（前端按角色卡派生）
    roundText: string;
  }
```

`hide` op 增加必填 `stealthTotal: number`。

技能加值派生：`passiveCombatRules.deriveSkillCheckBonus(char, 'perception')`
= 属性调整 + 熟练倍数 × 熟练加值 + `skills[key].extra`（与被动检定同源，不含仅被动生效的特性加成）。

## 4. 结算

新增 `src/data/searchRules.ts`：

```ts
resolveSearch({ searcherId, total, combatants })
  → { revealed: {targetId, name}[], skipped: {targetId, name}[] }
```

- 遍历 `combatants`（排除搜索者自己），取每个目标活跃 `hidden` 实例；
- 有 `stealthTotal` 且 `total > stealthTotal` → `declareEnd`，计入 revealed；
- 无 `stealthTotal`（老数据）→ 计入 skipped，不改状态，界面提示 DM 补录；
- 平局不解除。

DM 端 `CombatSession.searchFor` 与玩家 op 路径 `turnCommitApply` 共用该函数，避免双份判定。

### 4.1 动作经济

- 玩家 op：`turnCommitApply` 内 `consumeAction(actor.id)`（`consumedAction` 去重），与 hide/dodge 同构；`useActions.isConsumptionActive()` 天然覆盖放映模式与试验场资源开关。
- DM 端：`consumeCombatantAction`（同 hideFor）。

### 4.2 文案

- 先攻表格行：`搜索（察觉 {total}）：发现 {n} 名潜伏者` / `搜索（察觉 {total}）：未发现目标`；skipped 追加 `（{m} 个潜伏者未录入隐匿值，待 DM 补录）`。
- 不写入目标名字，避免向观战端泄露身份。

## 5. 入口

| 端 | 入口 | 掷骰交互 |
|---|---|---|
| DM | 棋子信息面板「可执行动作 → 搜索」 | `DiceInputModal` 填 d20 骰面，加值由角色卡派生（无卡按 0） |
| 玩家 | 棋子信息面板「搜索」+ 回合面板「搜索」按钮 | `DiceInputModal` 填 d20，前端加察觉加值后打包 op |

躲藏入口改造（同一期）：

- DM `hideFor`：先弹 `DiceInputModal` 录入隐匿总值，再挂状态并展示观察者被动察觉清单。
- 玩家躲藏按钮：先弹 `DiceInputModal` 录入隐匿总值，再 `addOp({kind:'hide', stealthTotal})`。
- 玩家躲藏裁定请求：先录入隐匿总值，随请求带给 DM；批准后回填 op 携带该值。
- 特性转换 `resourceConvEngine` hide 分支：按被动隐匿代填 `stealthSource:'passive'`。

## 6. 明确不做

- 搜物/搜陷阱/搜密门（DM 用检定请求自设 DC）。
- hidden 状态向玩家投影（会泄露位置；搜索结果只回发现/未发现）。
- 状态持久化到战斗记录（沿用内存单例现状）。
- 隐匿值自动重掷/自动过期。
