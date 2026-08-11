# src/pages/TreasureEdit.tsx

## 功能概述
该文件 `TreasureEdit.tsx` 是一个 React 组件，负责实现宝藏编辑页面的功能。它允许用户创建或编辑宝藏，包括设置宝藏的标题、货币、物品列表等。该页面是用户与宝藏数据交互的主要界面。

## 主要导出/接口
- `PRICE_UNITS`: 常量数组，包含宝藏货币单位类型。
- `TreasureEdit`: 默认导出的 React 函数组件，负责渲染宝藏编辑页面。

```typescript
const PRICE_UNITS: TreasurePriceUnit[] = ['pp', 'gp', 'sp', 'cp'];

export default function TreasureEdit() {
  // ...
}
```

## 核心实现说明
- 该组件使用 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。
- `useParams` 和 `useNavigate` 钩子用于获取路由参数和导航功能。
- `treasureStore` 用于与宝藏数据存储进行交互。
- `EquipmentPicker` 组件用于从装备库中选择物品添加到宝藏中。
- 组件包含多个状态变量，如 `title`、`currency`、`items` 等，用于存储宝藏的标题、货币和物品列表。
- `handleSave` 函数用于保存宝藏数据。
- `addEquipment` 和 `addCustomItem` 函数用于添加装备和自定义物品到宝藏中。
- `updateItemField`、`removeItem` 和 `updateItemQty` 函数用于更新、删除和修改物品列表中的物品。

## 注意事项或使用方式
- 在使用该组件之前，需要确保已经正确设置了路由和宝藏数据存储。
- 用户可以通过点击“添加自定义物品”按钮来添加自定义物品，或者通过点击“从装备库添加”按钮来从装备库中选择物品。
- 用户可以编辑物品的属性，包括名称、数量、分类、单价和重量。
- 用户可以通过点击“保存”按钮来保存宝藏数据。
