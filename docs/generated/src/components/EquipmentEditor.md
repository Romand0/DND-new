# src/components/EquipmentEditor.tsx

## 功能概述

`EquipmentEditor.tsx` 文件定义了一个 React 组件，用于编辑和创建装备信息。该组件负责收集用户输入的装备数据，并在保存时将数据传递给父组件。它还处理装备的删除操作，并提供了一个确认对话框。

## 主要导出/接口

- **导出类型**：
  - `EquipmentEditorProps`：组件接收的属性类型定义。
  - `EquipmentItem`：装备项的类型定义。
- **导出函数**：
  - `EquipmentEditor`：组件本身。
- **导出常量**：
  - `CATEGORIES`：装备分类数组。
  - `PRICE_UNITS`：价格单位数组。
  - `PROPERTY_OPTIONS`：属性选项数组。
  - `DAMAGE_TYPES`：伤害类型数组。

```typescript
interface EquipmentEditorProps {
  item?: EquipmentItem | (EquipmentItem & { quantity?: number });
  isStatic?: boolean;
  showQuantity?: boolean;
  showPackSize?: boolean;
  showSyncOption?: boolean;
  loading?: boolean;
  onSave: (item: EquipmentItem & { quantity?: number }, syncToLibrary?: boolean) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const CATEGORIES = ['武器', '护甲', '药水', '法器', '工具', '杂物', '自定义'];
const PRICE_UNITS = ['gp', 'sp', 'cp'] as const;
const PROPERTY_OPTIONS = ['轻型', '灵巧', '多功能', '重型', '双手', '远程', '弹药', '+2 AC', '单手', '双手'];
const DAMAGE_TYPES = ['穿刺', '钝击', '挥砍', '火焰', '冰冻', '闪电', '光', '黯蚀', '心灵', '毒素', '力场', '声波', '神力'];
```

## 核心实现说明

`EquipmentEditor` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理状态和副作用。它接收一个可选的 `item` 属性，该属性可以是装备项或包含数量的装备项。组件根据传入的 `item` 初始化表单数据，并在 `item` 发生变化时更新数据。

组件包含以下关键功能：

- **表单数据管理**：通过 `formData` 状态管理装备信息。
- **属性和标签管理**：允许用户添加和删除属性和标签。
- **分类选择**：支持选择预定义分类或自定义分类。
- **保存和删除操作**：处理保存和删除装备的逻辑。

组件与项目其他模块的关系：

- 通过 `onSave` 和 `onDelete` 回调函数与父组件通信。
- 使用 `loading` 状态来控制保存按钮的禁用状态。

## 注意事项或使用方式

- 组件应作为父组件的子组件使用，并传入相应的属性。
- `item` 属性是可选的，用于编辑现有装备。
- `onSave` 回调函数负责处理保存操作，并接收装备数据和是否同步到装备库的布尔值。
- `onDelete` 回调函数用于处理删除操作。
- `onClose` 回调函数用于关闭编辑器。
