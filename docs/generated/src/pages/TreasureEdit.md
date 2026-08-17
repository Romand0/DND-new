# src/pages/TreasureEdit.tsx

## 功能概述
该文件定义了宝藏编辑页面的 React 组件 `TreasureEdit`。该组件负责展示和编辑宝藏的详细信息，包括标题、货币、物品列表、经验值等。它允许用户创建新的宝藏或编辑现有的宝藏。

## 主要导出/接口
- `PRICE_UNITS`: 常量，包含宝藏货币单位数组。
- `TreasureEdit`: 默认导出的 React 组件，用于渲染宝藏编辑页面。

```typescript
const PRICE_UNITS: TreasurePriceUnit[] = ['pp', 'gp', 'sp', 'cp'];

export default function TreasureEdit() {
  // ...
}
```

## 核心实现说明
`TreasureEdit` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。它通过 `useParams` 和 `useNavigate` 钩子获取路由参数和导航功能。

组件的核心功能包括：
- 加载和保存宝藏数据。
- 添加和编辑物品。
- 管理物品列表和状态。

该组件依赖于以下模块和组件：
- `treasureStore`: 用于存储和操作宝藏数据。
- `EquipmentPicker`: 用于从装备库选择物品的组件。
- `WeightInput`: 用于输入物品重量的自定义输入框。

## 注意事项或使用方式
- 使用该组件前，确保已正确安装和配置了必要的依赖项。
- 在编辑宝藏时，请确保所有字段都已填写完整。
- 物品数量和单价应填写正确的数值。
