# Requirements Document — 战斗结算（Combat Settlement）

Feature Name: combat-settlement
Created: 2026-11-05
Status: Draft v1

## Introduction

战斗结束后，将战斗期间产生的全部变更（装备、法术位、HP、持续状态）统一并入角色卡，并将战斗记录封存。结束目前「战斗记录删除即变更丢弃」的隐式语义，落实「战斗全程角色卡只读、结算时统一并入」的架构惯例。

## Glossary

- **战斗结算（Settlement）**：把 CombatRecord 上累积的战斗临时变更写入对应角色卡的一次性操作。
- **漏斗（Funnel）**：CombatRecord 上的战斗临时副本数据（equipmentChanges / spellSlotChanges / combatant 字段），战斗期间只记增量，角色卡源不被触碰。
- **封存（Sealed）**：结算完成后的记录标记（settledAt 时间戳），表示变更已并入、记录保留供查阅。
- **状态继承**：结算时把仍活跃的 StatusInstance 从参战者（combat 域）转移到角色卡（global 域）。
- **来源未中断**：由专注维持的状态，其施法者未死亡、未失能、专注未被打破；非专注状态默认来源有效。

## Requirements

### R1 结算入口

**User Story:** AS DM，我想在战斗结束的地方直接发起结算，这样打完就能立即归档。

#### Acceptance Criteria

1. WHEN DM 在战斗追踪页（CombatSession）点击「结束并结算」按钮，系统 SHALL 打开结算预览弹窗。
2. WHEN DM 在战斗列表（CombatList）卡片上点击「结算」按钮，系统 SHALL 打开同一结算预览弹窗。
3. IF 战斗记录已封存（settledAt 存在），系统 SHALL 禁用两处结算入口并显示「已结算」标识。
4. IF 战斗记录为试验场（isProvingGround），系统 SHALL 隐藏结算入口。

### R2 结算预览弹窗

**User Story:** AS DM，我想在结算前逐项检查并勾选要并入的变更，这样能排除误操作与不想保留的结果。

#### Acceptance Criteria

1. WHEN 结算弹窗打开，系统 SHALL 按参战者分组展示：装备变更明细、法术位消耗明细、HP 变更前后值、可继承状态列表。
2. WHEN 参战者没有任何可并入变更，系统 SHALL 在该分组显示「无变更」。
3. 系统 SHALL 默认勾选全部可并入项，并允许 DM 逐项取消勾选。
4. 系统 SHALL 跳过 NPC 与无角色卡的参战者（无并入目标，不展示分组）。
5. WHEN DM 确认结算，系统 SHALL 仅应用勾选中的变更。

### R3 装备变更并入

**User Story:** AS DM，我想让战斗中消耗与拾取的装备反映到角色背包，这样物资账目连续。

#### Acceptance Criteria

1. WHEN 应用 quantityDeltas，系统 SHALL 按 childId 对 character.equipment 数量增减。
2. WHEN 某装备生效数量减至 0，系统 SHALL 从 character.equipment 整件移除该 childId 条目。
3. WHEN 应用 added 条目，系统 SHALL 以战斗实例快照追加到 character.equipment，childId 复用源值（源中已存在该 childId 时合并数量）。
4. IF 同一 childId 同时存在 added 与移除记录，系统 SHALL 以移除记录优先（与 computeChildQtyMap 抵消语义一致）。

### R4 法术位并入

**User Story:** AS DM，我想让战斗中消耗的法术位反映到角色卡，这样长休前的余量真实。

#### Acceptance Criteria

1. WHEN 应用 spellSlotChanges，系统 SHALL 把各环位 delta 累加到 character.spells.spellSlots[levelKey].used。
2. 系统 SHALL 把 used 限制在 [0, max] 区间内（防超写）。

### R5 HP 并入

**User Story:** AS DM，我想让战斗结束时的 HP 反映到角色卡，这样战斗间 HP 连续。

#### Acceptance Criteria

1. WHEN 应用 HP 变更，系统 SHALL 把 combatant.currentHp 写入 character.currentHp。
2. 系统 SHALL 把写入值限制在 [0, character.maxHp] 区间内。
3. 系统 SHALL 丢弃临时 HP（tempHp 仅战斗内有效，不并入）。

### R6 状态继承

**User Story:** AS DM，我想让战斗结束时仍然持续的状态（昏迷、中毒、专注维持的法术效果等）跟随角色离开战斗，这样效果跨战斗连续。

#### Acceptance Criteria

1. WHEN 结算弹窗打开，系统 SHALL 扫描 targetId 指向该参战者且 isActive 的全部状态实例，列入可继承清单。
2. IF 状态实例由专注维持且其施法者已死亡、失能或专注已被打破，系统 SHALL 将其排除出可继承清单。
3. WHEN 状态被继承，系统 SHALL 把实例的 scope 从 combat 转为 global、targetId 从 combatantId 改写为 characterId、清除 combatId 关联。
4. WHEN PC 参战者处于昏迷（isUnconscious）且无对应 unconscious 状态实例，系统 SHALL 生成一条 unconscious 状态实例并入角色卡。
5. WHEN 状态继承完成，系统 SHALL 在角色卡详情中可见该状态（含名称与剩余持续信息）。
6. IF 状态实例的 targetId 对应参战者已死亡，系统 SHALL 将其排除出可继承清单（死亡终结一切持续效果）。
7. WHEN 回合驱动型状态（rounds / combatantTurn）被继承，系统 SHALL 将其过期策略转为手动取消，并在实例元数据中保留剩余回合数提示。
8. WHEN 真实时间型状态（minutes / hours）被继承，系统 SHALL 保留其 expiresAt（随真实时间继续过期）。

### R7 封存

**User Story:** AS DM，我想让已结算的战斗记录保留在列表中供查阅，并防止重复结算。

#### Acceptance Criteria

1. WHEN 结算确认并应用完成，系统 SHALL 给战斗记录写入 settledAt 时间戳。
2. WHILE 战斗记录已封存，战斗列表 SHALL 显示「已结算」徽记与结算时间。
3. WHILE 战斗记录已封存，系统 SHALL 阻止再次打开结算弹窗。
4. WHILE 战斗记录已封存，战斗追踪页 SHALL 进入只读状态：禁用攻击、施法、动作消耗、HP 编辑、参战者增删、状态附加、放映模式切换等一切写操作，保留查看与导出。

### R8 下次开战重新挂载

**User Story:** AS DM，我想让角色卡上仍在作用期内的状态在下一次战斗自动重新挂载到参战者，这样状态效果跨战斗闭环。

#### Acceptance Criteria

1. WHEN 带有活跃状态的角色卡被加入新战斗，系统 SHALL 把角色卡上 isActive 且仍在作用期内的状态实例复制挂载到新参战者（combat 域）。
2. IF 实例的 expiresAt（真实时间）已过，系统 SHALL 跳过挂载该实例。
3. WHEN 挂载完成，系统 SHALL 在参战者上呈现与战斗内施加状态一致的效果（优劣势、抗性等自动生效）。
4. WHEN 结算时参战者上来自角色卡的状态实例已结束（战斗中被 declareEnd），系统 SHALL 从角色卡移除对应实例；仍活跃的 SHALL 以战斗中的最新状态写回角色卡。
