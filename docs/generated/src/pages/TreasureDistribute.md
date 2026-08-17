# src/pages/TreasureDistribute.tsx

## 功能概述

该文件 `TreasureDistribute.tsx` 是一个 React 组件，负责处理和展示宝藏分配的界面。它允许用户从宝藏中分配货币、经验和物品到不同的角色。该组件通过使用 React 的状态管理和生命周期特性，以及与数据存储模块的交互，实现了分配逻辑和用户界面。

## 主要导出/接口

- `TreasureDistribute`：主组件，负责渲染整个宝藏分配界面。
- `CurrencyKey`：货币键类型，定义了不同货币的类型。
- `DistributionItem`：分配物品接口，包含物品ID、名称、数量和单价。
- `CharacterDistribution`：角色分配接口，包含角色ID、名称、货币、物品和经验。
- `CURRENCY_META`：货币元数据常量数组，包含货币键、标签和颜色。
- `formatCurrencyShort`：格式化货币显示的辅助函数。
- `treasureCurrencyToCharacter`：将宝藏货币转换为角色货币的辅助函数。
- `treasurePriceToEquipmentPrice`：将宝藏物品单价转换为装备价格的辅助函数。

## 核心实现说明

该组件的核心实现包括以下部分：

- **状态管理**：使用 `useState` 和 `useEffect` 管理组件的状态，如宝藏信息、剩余物品、剩余货币、剩余经验、分配记录等。
- **数据交互**：通过 `useParams` 和 `useNavigate` 获取路由参数和导航功能，通过 `treasureStore` 和 `characterStore` 与数据存储模块交互获取和更新数据。
- **分配逻辑**：实现货币、经验和物品的分配逻辑，包括选择分配对象、分配数量、分配操作等。
- **动画和反馈**：使用 `triggerReceiveAnim` 函数触发角色分配卡片的脉冲动画，提供视觉反馈。

该组件被其他模块引用，用于处理和展示宝藏分配的结果。

## 注意事项或使用方式

- 用户需要先选择宝藏，然后选择角色进行分配。
- 可以分配货币、经验和物品到角色。
- 分配完成后，可以查看分配结果并确认。
- 如果需要修改分配结果，可以返回修改。
