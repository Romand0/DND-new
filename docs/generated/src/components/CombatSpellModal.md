# src/components/CombatSpellModal.tsx

## 功能概述
该文件定义了 `CombatSpellModal` 组件，用于在游戏中展示法术施放弹窗。该弹窗允许用户浏览和选择法术，进行攻击检定或豁免检定，并计算法术效果。它与攻击检定完全独立，从沙盘“法术”按钮触发。

## 主要导出/接口
- **类型**:
  - `Stage`: 'list' | 'cast' - 法术施放阶段类型
  - `CheckType`: 'ac' | 'save' | 'none' - 检定方式类型
  - `EffectType`: 'damage' | 'heal' - 效果类型
  - `Props`: 组件属性类型
  - `AdvantageContext`: 豁免规则上下文类型
  - `AdvantageResult`: 豁免结果类型
- **函数**:
  - `parseDice(expr: string): { count: number; sides: number; bonus: number }` - 解析骰子表达式
  - `renderSpellDice(text: string): ReactNode[]` - 渲染法术描述中的骰子表达式
  - `handlePickSpell(spell: Spell)`: 选择法术
  - `handleCheckTypeChange(t: CheckType)`: 切换检定方式
  - `applyDiceValues(newValues: string[])`: 应用 d20 输入变化
  - `handleRollD20()`: 摇 d20
  - `handleConfirmCheck()`: 确定检定
  - `computeEffectTotal(): number`: 计算效果总数值
  - `handleRollEffectDice()`: 摇效果骰
  - `updateEffectDie(idx: number, val: string)`: 更新效果骰值
  - `handleCalcEffect()`: 计算效果
  - `handleConfirmCast()`: 确认施放
- **组件**:
  - `AdvDisadvToggle`: 豁免优劣势切换组件
  - `SpellCard`: 法术卡片组件
- **Store**:
  - `characterStore`: 角色数据存储
  - `spellStore`: 法术数据存储
  - `combatStore`: 战斗数据存储
- **常量**:
  - `SAVE_ATTR_MAP`: 豁免属性短写与全称映射

## 核心实现说明
`CombatSpellModal` 组件负责管理法术施放流程，包括法术选择、检定、效果计算和施放确认。它使用状态管理来跟踪用户的选择和输入，并调用相关数据存储和计算函数来处理逻辑。

- **关键逻辑**: 组件通过状态管理跟踪用户的选择和输入，并调用相关函数来处理逻辑，如解析骰子表达式、计算结果、处理豁免规则等。
- **状态管理**: 组件使用多个状态变量来跟踪用户的选择和输入，如 `selectedSpell`、`checkType`、`effectType`、`d20Values` 等。
- **与项目其他模块的关系**: 组件依赖于 `characterStore`、`spellStore` 和 `combatStore` 等数据存储模块来获取角色和法术数据，并使用 `rollDice` 函数来摇骰。
- **被谁引用**: 该组件被游戏主界面或其他需要展示法术施放弹窗的模块引用。

## 注意事项或使用方式
- 用户需要选择法术并进入施放阶段。
- 根据选择的检定方式，用户可能需要进行攻击检定或豁免检定。
- 在无检定场景下，用户可以直接输入效果数值。
- 用户可以手动输入骰子表达式或使用摇骰功能来计算效果数值。
- 用户需要确认施放，并传入相关信息以更新游戏状态。
