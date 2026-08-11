# src/pages/EquipmentList.tsx

## 功能概述
该文件 `EquipmentList.tsx` 是一个 React 组件，负责展示和管理游戏中的装备列表。它承担着以下职责：
- 展示所有装备列表，包括装备名称、类别、价格、重量等。
- 提供搜索和分类功能，以便用户可以快速找到所需的装备。
- 允许管理员（DM）进行增删改查（CRUD）操作，包括新增、编辑、删除单个或多个装备。
- 支持从云端同步装备数据。

## 主要导出/接口
- `CATEGORIES`: 常量，包含所有装备类别。
- `EquipmentList`: 默认导出的 React 组件，负责渲染装备列表页面。

```typescript
const CATEGORIES = ['全部', '武器', '护甲', '药水', '法器', '工具', '杂物', '自定义'];

export default function EquipmentList() {
  // ...
}
```

## 核心实现说明
- `EquipmentList` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。
- 使用 `useNavigate` 和 `useAuth` 钩子来处理路由跳转和权限验证。
- `useMemo` 钩子用于缓存计算结果，以提高性能。
- `fetchAllEquipments`、`createEquipment`、`updateEquipment`、`deleteEquipment` 和 `deleteEquipments` 是从 `@/lib/api` 模块导入的 API 函数，用于与后端进行数据交互。
- 组件中包含搜索、分类、选择、编辑、删除、同步等逻辑。

## 注意事项或使用方式
- 组件仅对管理员（DM）开放编辑和删除权限。
- 用户可以通过搜索框和分类标签来筛选装备。
- 在选择模式下，可以批量选择和删除装备。
- 可以通过点击“同步”按钮从云端刷新装备数据。
