# src/hooks/combat/useCombatInventories.ts

## 功能概述
该文件定义了一个名为 `useCombatInventories` 的 React 钩子函数，用于获取战斗记录中的每个战斗者的装备信息，并计算其有效护甲值。该钩子函数旨在帮助组件在渲染时能够访问到战斗者的装备和护甲值，以便进行相关计算或展示。

## 主要导出/接口
- `useCombatInventories(record: CombatRecord | null)`: 导出函数，接受一个可选的战斗记录对象，返回一个包含战斗者装备信息和计算有效护甲值的函数。
  - 参数：
    - `record: CombatRecord | null`: 战斗记录对象，类型为 `CombatRecord` 或 `null`。
  - 返回值：
    - `Record<string, Equipment[]>`: 一个对象，键为战斗者的 ID，值为该战斗者的装备数组。
    - `getEffectiveAc: (c: Combatant) => number`: 一个函数，接受一个战斗者对象，返回该战斗者的有效护甲值。

## 核心实现说明
该钩子函数使用 `useMemo` 钩子来缓存战斗者的装备信息，以避免在每次渲染时重复计算。它首先检查传入的战斗记录是否存在，如果不存在则返回一个空对象。如果存在，则遍历战斗记录中的所有战斗者，并使用 `getCombatInventory` 函数获取每个战斗者的装备信息，存储在一个对象中。

`getEffectiveAc` 函数用于计算战斗者的有效护甲值。如果战斗记录存在，它会尝试从 `characterStore` 中获取与战斗者关联的角色信息，并使用 `computeCombatantAc` 函数计算护甲值。如果无法获取角色信息，则直接返回战斗者对象中的护甲值。

该钩子函数与项目中的 `characterStore` 和 `combatStore` 模块紧密相关，用于获取角色和战斗数据。它被组件或其他钩子函数引用，以获取战斗者的装备和护甲值信息。

## 注意事项或使用方式
- 使用该钩子函数时，需要传入一个有效的战斗记录对象。
- 在使用 `getEffectiveAc` 函数时，确保传入的战斗者对象具有有效的 `id` 属性。
- 该钩子函数适用于需要根据战斗记录动态计算战斗者装备和护甲值的场景。
