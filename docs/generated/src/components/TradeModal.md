# src/components/TradeModal.tsx

## 功能概述
该文件定义了 `TradeModal` 组件，用于展示交易/物资分配弹窗。该弹窗支持三种模式：买入（从装备库选购入发起者背包）、卖出（从背包售出换货币）和分配（背包+现金转移给他人）。组件通过 `characterId` 接收发起角色 ID，并通过 `onClose` 函数关闭弹窗。

## 主要导出/接口
- **类型**:
  - `Mode`: 交易模式类型，包含 'buy'（买入）、'sell'（卖出）和 'transfer'（分配）。
  - `BuyCartItem`: 买入清单项类型，包含 `item`（装备项）和 `quantity`（数量）。
  - `SellCartItem`: 卖出清单项类型，包含 `item`（装备）、`quantity`（数量）、`unitPriceCp`（单件售价）。
  - `TransferEquipItem`: 分配清单项（物资）类型，包含 `item`（装备）和 `quantity`（数量）。
  - `TransferCashItem`: 分配现金（铜币总数）类型，包含 `cp`（铜币数）。
  - `Props`: 组件属性类型，包含 `characterId`（发起角色 ID）和 `onClose`（关闭函数）。
- **函数**:
  - `formatCurrency`: 格式化货币展示。
  - `formatCopper`: 铜币总数展示。
  - `isFullPriceItem`: 判断是否为原价售卖家分类。
- **组件**:
  - `TradeModal`: 交易/物资分配弹窗组件。
- **Store**:
  - `characterStore`: 角色数据存储。
- **常量**:
  - 无。

## 核心实现说明
- `TradeModal` 组件根据传入的 `characterId` 初始化角色数据，并支持三种交易模式。
- 买入模式：从装备库中选择物品，并计算总价和重量，判断是否可购买。
- 卖出模式：从背包中选择物品，并计算总价，判断是否可售出。
- 分配模式：选择目标角色和物资，并计算总价和重量，判断是否可分配。
- 组件使用 `useEffect` 钩子监听 `characterId` 和 `doneMsg` 变化，以刷新角色数据和完成提示。
- 组件使用 `useMemo` 钩子缓存计算结果，以提高性能。

## 注意事项或使用方式
- 组件通过 `characterId` 接收发起角色 ID，并通过 `onClose` 函数关闭弹窗。
- 买入、卖出和分配模式分别对应不同的功能，请根据实际需求选择合适的模式。
- 在买入和卖出模式下，请确保角色拥有足够的货币或物品数量。
- 在分配模式下，请确保目标角色存在且背包容量足够。
