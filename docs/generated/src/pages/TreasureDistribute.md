# src/pages/TreasureDistribute.tsx

## 功能概述
该文件定义了 TreasureDistribute 组件，负责处理宝藏的分配逻辑。它允许用户从宝藏中选择物品和货币，并将它们分配给不同的角色。组件还负责处理分配过程中的状态管理和动画效果。

## 主要导出/接口
- `TreasureDistribute`: 主组件，负责渲染分配界面和处理分配逻辑。
- `CurrencyKey`: 货币类型的枚举类型，包括 'pp', 'gp', 'sp', 'cp'。
- `DistributionItem`: 分配物品的接口，包含 `id`, `name`, `quantity`, `unitPrice` 和 `animKey` 属性。
- `CharacterDistribution`: 分配角色的接口，包含 `characterId`, `characterName`, `currency` 和 `items` 属性。
- `CURRENCY_META`: 货币元数据常量数组，包含 `key`, `label` 和 `color` 属性。

## 核心实现说明
- `TreasureDistribute` 组件使用 React 的 `useState`, `useEffect`, `useCallback`, `useRef` 和 `useMemo` 钩子来管理状态和副作用。
- 组件从 URL 参数中获取宝藏 ID，并使用 `treasureStore` 获取宝藏信息。
- `useState` 用于管理宝藏、剩余物品、剩余货币、选中的卡片 ID、选中的货币类型、选中的数量、分配记录和角色选择状态。
- `useEffect` 用于处理宝藏和角色数据的变化。
- `selectItemCard` 和 `selectCurrencyCard` 用于选择物品和货币卡片。
- `triggerReceiveAnim` 用于触发角色卡片的脉冲动画。
- `startLongPress` 和 `cancelLongPress` 用于处理长按事件。
- `addDistributor` 用于添加分配者。
- `distributeToCharacter` 用于将物品或货币分配给角色。
- `confirmSliderDistribution` 用于确认数量选择。
- `returnItemToTreasure` 和 `returnCurrencyToTreasure` 用于从分配者退回物品和货币。
- `handleFinish` 和 `confirmFinish` 用于处理分配完成。

## 注意事项或使用方式
- 用户需要先选择宝藏，然后选择要分配的物品或货币。
- 可以通过长按物品卡片来选择分配数量。
- 可以通过点击角色卡片来将选中的物品或货币分配给该角色。
- 分配完成后，可以点击“完成”按钮来确认分配结果。
