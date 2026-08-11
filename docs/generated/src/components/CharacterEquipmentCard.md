# src/components/CharacterEquipmentCard.tsx

## 功能概述
该文件定义了 `CharacterEquipmentCard` 组件，用于展示和操作角色装备信息。组件负责显示装备的名称、分类、重量、价格、描述、属性标签、自由标签等，并提供编辑、穿戴、卸下、手持、删除等操作。

## 主要导出/接口
- **类型**：`Props`
  - `item: Equipment & { id: string }`: 装备信息对象，包含装备的基本属性和ID。
  - `characterId?: string`: 角色ID，用于关联装备和角色。
  - `onEdit?: (item: Equipment & { id: string }) => void`: 编辑装备的回调函数。
  - `onDelete?: (itemId: string) => void`: 删除装备的回调函数。
  - `onUpdateQuantity?: (itemId: string, delta: number) => void`: 更新装备数量的回调函数。
  - `onRefresh?: () => void`: 刷新组件的回调函数。
  - `showQuantity?: boolean`: 是否显示数量信息。
  - `heldHand?: 'L' | 'R' | null`: 当前装备手持状态，'L'为左手，'R'为右手，null为未手持。
  - `onHeldLabelClick?: () => void`: 点击手持标签的回调函数。

## 核心实现说明
- 组件通过 `useState` 钩子管理展开/收起状态。
- 使用 `isWearable` 和 `isHoldable` 函数判断装备是否可穿戴和可手持。
- 根据装备类型和状态显示不同的标签和操作按钮。
- 通过 `characterStore` 对象与后端进行交互，实现穿戴、卸下、手持、删除等操作。
- 组件支持展开/收起详情区域，显示装备的描述、属性标签、自由标签、子分类和来源等信息。

## 注意事项或使用方式
- 组件需要传入 `item` 对象，包含装备的基本属性和ID。
- 可选传入 `characterId`，用于关联装备和角色。
- 可选传入 `onEdit`、`onDelete`、`onUpdateQuantity`、`onRefresh` 等回调函数，用于处理编辑、删除、更新数量和刷新操作。
- 可选传入 `showQuantity`、`heldHand`、`onHeldLabelClick` 等参数，用于控制数量显示、手持状态和手持标签回调。
