# src/hooks/combat/useThrownDrop.ts

## 功能概述
该文件定义了 `useThrownDrop` 钩子，用于处理投掷武器掉落逻辑。它负责计算掉落位置，并执行从攻击者背包移除武器，在战场网格上生成物品 token 的操作。

## 主要导出/接口
- `chebyDist(a: { col: number; row: number }, b: { col: number; row: number }): number`
  - 计算两点之间的曼哈顿距离。
- `calcThrownDropPos(attackerPos: { col: number; row: number }, targetPos: { col: number; row: number }, hit: boolean, rangeUsedFeet: number, targetSpeed: number, gridCols: number, gridRows: number): { col: number; row: number }`
  - 根据攻击者位置、目标位置、是否命中、射程、目标速度和网格大小计算投掷武器的掉落位置。
- `useThrownDrop(recordId: string | null)`
  - 返回一个对象，包含 `executeThrownDrop` 函数，用于执行投掷武器掉落操作。

## 核心实现说明
- `chebyDist` 函数计算两点之间的曼哈顿距离，用于计算位置之间的距离。
- `calcThrownDropPos` 函数根据不同的条件计算掉落位置，包括命中和未命中情况。
- `useThrownDrop` 钩子中定义的 `executeThrownDrop` 函数负责执行实际的掉落逻辑，包括从攻击者背包移除武器，并在战场网格上生成物品 token。

## 注意事项或使用方式
- `executeThrownDrop` 函数仅在 `usageMode` 为 `'thrown'` 时执行掉落逻辑。
- 需要提供攻击者、目标、攻击信息、攻击者位置、目标位置、是否命中、记录和可选的使用模式。
- 该钩子依赖于 `characterStore`、`battlegroundStore` 和 `combatStore`，需要确保这些数据存储已正确初始化。
