# src/hooks/useEquipmentActions.ts

## 功能概述
该文件定义了 `useEquipmentActions` 钩子函数，用于封装与角色装备相关的操作逻辑。它负责处理装备的添加、保存、删除和数量更新等动作，并同步这些操作到角色存储和库中。

## 主要导出/接口
```typescript
export function useEquipmentActions(charId: string | undefined, refresh: () => void): {
  handleAddEquipmentFromLibrary: (item: any) => Equipment & { id: string; templateId?: string } | null;
  handleSaveEquipment: (
    editingEquipment: (Equipment & { id: string }) | null,
    formData: any,
    syncToLibrary?: boolean,
    onSuccess?: () => void
  ) => Promise<void>;
  handleDeleteEquipment: (deleteConfirmId: string | null) => void;
  handleUpdateEquipmentQuantity: (equipId: string, delta: number) => void;
};
```

## 核心实现说明
`useEquipmentActions` 钩子函数通过 `useCallback` 钩子确保相关的函数在组件重新渲染时不会重新创建，从而提高性能。

- `handleAddEquipmentFromLibrary`：从库中添加装备到角色，生成临时装备对象。
- `handleSaveEquipment`：保存装备信息，包括同步到库和更新角色存储。
- `handleDeleteEquipment`：删除角色中的装备。
- `handleUpdateEquipmentQuantity`：更新装备的数量。

该钩子依赖于 `charId` 和 `refresh` 函数，其中 `refresh` 用于触发组件重新渲染，确保界面与数据同步。

## 注意事项或使用方式
- 使用 `useEquipmentActions` 钩子时，必须提供有效的 `charId`。
- 调用 `handleSaveEquipment` 时，`formData` 应包含装备的相关信息。
- `handleDeleteEquipment` 和 `handleUpdateEquipmentQuantity` 需要提供装备的 `deleteConfirmId` 或 `equipId`。
- 使用前确保已正确初始化角色存储和 API 接口。
