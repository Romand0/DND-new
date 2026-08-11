# src/components/NpcCreator.tsx

## 功能概述
该文件 `NpcCreator.tsx` 是一个用于创建和管理NPC（非玩家角色）的React组件。它允许用户选择或创建NPC，编辑其属性，如名称、属性、生命值、速度、AC（护甲等级）和攻击等，并将它们导入到战斗中。

## 主要导出/接口
- **导出类型**:
  - `NpcTemplate`: NPC模板类型。
  - `NpcAttack`: NPC攻击类型。
  - `Combatant`: 战斗参与者类型。
  - `NpcEditState`: NPC编辑状态类型。
  - `Props`: 组件属性类型。
- **导出函数**:
  - `calcModifier`: 计算属性调整值。
  - `createStateFromTemplate`: 从模板创建NPC编辑状态。
  - `stateToCombatant`: 将NPC编辑状态转换为战斗参与者。
- **导出组件**:
  - `NpcCreator`: 主组件，用于创建和管理NPC。
  - `NpcEditor`: NPC编辑器组件。
  - `TemplateEditor`: 模板编辑器组件。
- **导出常量**:
  - `ABILITY_NAMES`: 能力名称数组。
  - `ABILITY_LABELS`: 能力标签映射。
  - `DAMAGE_TYPES`: 伤害类型数组。
  - `WEAPON_PROPERTIES`: 武器属性数组。
  - `MUTUALLY_EXCLUSIVE`: 互斥属性映射。

## 核心实现说明
- **关键逻辑**: 组件通过状态管理来处理NPC的创建和编辑，包括从模板创建NPC、编辑单个NPC、批量创建NPC和编辑模板。
- **状态管理**: 使用React的`useState`和`useRef`钩子来管理组件的状态。
- **与项目其他模块的关系**: 组件依赖于`npcTemplateStore`来存储和更新NPC模板，以及`diceService`来生成骰子结果。
- **被谁引用**: 该组件被用于游戏中的NPC创建和管理流程。

## 注意事项或使用方式
- 组件需要传入`onClose`、`onCreate`和`onBatchCreate`函数，用于关闭创建窗口、创建单个NPC和批量创建NPC。
- 组件支持从模板创建NPC，也可以自定义创建NPC。
- 在批量创建NPC时，可以指定生成数量，并按先攻排序。
- 可以编辑NPC的属性，包括名称、属性、生命值、速度、AC和攻击等。
- 可以将编辑好的NPC导入到战斗中。
