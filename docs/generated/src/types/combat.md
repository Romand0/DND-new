# src/types/combat.ts

## 功能概述

该文件定义了与战斗相关的数据结构，包括参战者、NPC 模板、攻击、回合动作、回合快照、动作类型、回合待办事项、战斗记录、装备变更信息等。这些数据结构用于描述战斗过程中的各种状态和行为，为游戏逻辑提供支持。

## 主要导出/接口

### 数据结构

- `Combatant`：参战者接口，包含参战者的基本信息、状态、属性等。
- `NpcTemplate`：NPC 模板接口，定义了NPC的属性和攻击方式。
- `NpcAttack`：NPC 攻击接口，包含攻击名称、伤害、范围等。
- `RoundAction`：回合动作接口，用于记录每个参战者在回合中的动作。
- `TurnSnapshot`：回合快照接口，用于保存回合开始时的战斗状态。
- `CombatActionType`：动作类型枚举，定义了战斗中可能发生的动作类型。
- `ACTION_LABELS`：动作类型显示标签映射。
- `ALL_ACTIONS`：全部动作类型数组。
- `isOneActionCast`：判断施法时间是否为“1 动作”的函数。
- `TurnTodoType`：预设任务类型枚举。
- `TURN_TODO_TYPE_LABELS`：任务类型标签映射。
- `TurnTodo`：回合待办事项接口。
- `CombatRecord`：战斗记录接口，包含战斗的详细信息。
- `EquipmentChanges`：装备变更信息接口。
- `CombatInventoryItem`：已废除的旧结构，用于兼容读取。

### 优劣势接口类型

- `CheckScene`：检定场景类型枚举。
- `CheckSceneGroup`：场景通配组枚举。
- `AdvantageSourceKind`：优劣势来源类型标签枚举。
- `AdvantageReason`：优劣势原因条目接口。
- `AdvantageResult`：优劣势检测结果接口。
- `ManualMode`：手动模式枚举。
- `PendingAdvantageSource`：待消费的优劣势标记接口。

## 核心实现说明

该文件定义了与战斗相关的数据结构，为游戏逻辑提供支持。其中，`Combatant`、`NpcTemplate`、`NpcAttack` 等数据结构用于描述参战者和NPC的属性和行为；`RoundAction`、`TurnSnapshot`、`CombatRecord` 等数据结构用于记录战斗过程中的状态和行为；`CombatActionType`、`ACTION_LABELS`、`ALL_ACTIONS` 等数据结构用于定义战斗中可能发生的动作类型；`TurnTodo`、`TurnTodoType`、`TURN_TODO_TYPE_LABELS` 等数据结构用于描述回合待办事项；`EquipmentChanges`、`CombatInventoryItem` 等数据结构用于描述装备变更信息。

## 注意事项或使用方式

- 使用 `Combatant`、`NpcTemplate`、`NpcAttack` 等数据结构时，请注意其属性和方法的定义。
- 使用 `RoundAction`、`TurnSnapshot`、`CombatRecord` 等数据结构时，请注意其记录的内容和格式。
- 使用 `CombatActionType`、`ACTION_LABELS`、`ALL_ACTIONS` 等数据结构时，请注意其定义的动作类型和标签。
- 使用 `TurnTodo`、`TurnTodoType`、`TURN_TODO_TYPE_LABELS` 等数据结构时，请注意其定义的回合待办事项和标签。
- 使用 `EquipmentChanges`、`CombatInventoryItem` 等数据结构时，请注意其描述的装备变更信息。
