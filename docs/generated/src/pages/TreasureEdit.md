# src/pages/TreasureEdit.tsx

## 功能概述
该文件 `TreasureEdit.tsx` 是一个 React 组件，负责处理宝藏编辑页面的逻辑。它允许用户创建或编辑宝藏，包括设置标题、货币、物品列表等。该页面是用户与宝藏数据交互的主要界面。

## 主要导出/接口
- `PRICE_UNITS`: 常量数组，包含宝藏货币单位类型。
- `TreasureEdit`: 默认导出的 React 函数组件，用于渲染宝藏编辑页面。

```typescript
const PRICE_UNITS: TreasurePriceUnit[] = ['pp', 'gp', 'sp', 'cp'];

export default function TreasureEdit() {
  // ...
}
```

## 核心实现说明
- `useState` 和 `useEffect` 钩子用于管理组件的状态和副作用。
- `useParams` 和 `useNavigate` 钩子用于从 URL 中获取宝藏 ID 并进行页面导航。
- `treasureStore` 用于与宝藏数据存储进行交互，包括获取、创建和更新宝藏。
- `EquipmentPicker` 组件用于从装备库中选择物品添加到宝藏中。
- `WeightInput` 组件用于输入和编辑物品的重量。

该组件通过 `useEffect` 钩子加载现有宝藏数据，并通过 `handleSave` 函数保存宝藏信息。`addEquipment` 和 `addCustomItem` 函数用于添加装备和自定义物品到宝藏列表中。`updateItemField`、`updateItemQty` 和 `removeItem` 函数用于编辑和删除物品。

## 注意事项或使用方式
- 使用该组件前，确保已经正确安装并配置了 `react-router-dom` 和 `lucide-react`。
- 在添加自定义物品时，必须填写物品名称，数量至少为 1。
- 物品的单价和重量可以留空，表示无具体数值。
- 编辑物品时，可以修改分类、子分类、单价、重量和数量。
