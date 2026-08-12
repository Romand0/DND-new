# src/types/combat.ts

## 功能概述
该文件定义了与战斗相关的数据类型和接口，包括参战者、NPC 模板、攻击、回合动作、回合快照、动作类型、优劣势标记等。这些类型和接口用于描述战斗过程中的状态和逻辑，为游戏引擎提供数据支持。

## 主要导出/接口
### 类型
- `Combatant`: 描述参战者的属性，如 ID、名称、行动力、生命值、状态等。
- `NpcTemplate`: 描述 NPC 模板的属性，如 ID、名称、属性、生命值、速度、护甲等。
- `NpcAttack`: 描述 NPC 攻击的属性，如名称、攻击加值、伤害、范围等。
- `RoundAction`: 描述回合动作的映射，键为参战者 ID，值为动作类型。
- `TurnSnapshot`: 描述回合快照的属性，包括参战者、回合动作、战场状态等。
- `CombatActionType`: 动作类型枚举，包括攻击、施法、疾走等。
- `ACTION_LABELS`: 动作类型显示标签映射。
- `ALL_ACTIONS`: 全部动作类型数组。
- `BonusActionTriggerType`: 附赠动作连带触发类型枚举。
- `BonusActionTrigger`: 附赠动作连带触发定义。
- `ActionToBonusConversion`: 动作→附赠动作转换规则。
- `TurnTodoType`: 预设任务类型枚举。
- `TURN_TODO_TYPE_LABELS`: 任务类型标签映射。
- `TurnTodo`: 回合待办事项。
- `CombatRecord`: 战斗记录。
- `EquipmentChanges`: 单个参战者的装备变更信息。
- `CombatInventoryItem`: 已废除的旧结构。
- `CheckScene`: 检定场景类型枚举。
- `CheckSceneGroup`: 场景通配组枚举。
- `AdvantageSourceKind`: 优劣势来源类型标签枚举。
- `AdvantageReason`: 优劣势原因条目。
- `AdvantageResult`: 优劣势检测结果。
- `ManualMode`: 手动模式枚举。
- `PendingAdvantageSource`: 待消费的优劣势标记。

### 函数
- `isOneActionCast`: 判断施法时间是否为「1 动作」。
- `isBonusActionCast`: 判断施法时间是否为「1 附赠动作」。

## 核心实现说明
该文件定义了战斗相关的数据类型和接口，为游戏引擎提供数据支持。其中，`Combatant` 类型描述了参战者的属性，如 ID、名称、生命值、状态等；`NpcTemplate` 类型描述了 NPC 模板的属性，如 ID、名称、属性、生命值、速度、护甲等；`NpcAttack` 类型描述了 NPC 攻击的属性，如名称、攻击加值、伤害、范围等。此外，该文件还定义了回合动作、回合快照、动作类型、优劣势标记等类型和接口，用于描述战斗过程中的状态和逻辑。

## 注意事项或使用方式
- 使用 `Combatant` 类型创建参战者实例时，需确保必填字段已正确赋值。
- 使用 `NpcTemplate` 类型创建 NPC 模板实例时，需确保必填字段已正确赋值。
- 使用 `NpcAttack` 类型创建 NPC 攻击实例时，需确保必填字段已正确赋值。
- 使用 `RoundAction` 类型描述回合动作时，需确保键为参战者 ID，值为动作类型。
- 使用 `TurnSnapshot` 类型创建回合快照实例时，需确保必填字段已正确赋值。
- 使用 `CombatActionType` 枚举定义动作类型时，需确保值符合枚举定义。
- 使用 `ACTION_LABELS` 映射获取动作类型显示标签时，需确保键为动作类型。
- 使用 `ALL_ACTIONS` 数组获取全部动作类型时，可直接遍历数组。
- 使用 `isOneActionCast` 函数判断施法时间是否为「1 动作」时，需确保传入的 `castingTime` 字符串符合预期格式。
- 使用 `isBonusActionCast` 函数判断施法时间是否为「1 附赠动作」时，需确保传入的 `castingTime` 字符串符合预期格式。
