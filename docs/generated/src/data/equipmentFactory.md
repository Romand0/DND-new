# src/data/equipmentFactory.ts

## 功能概述
该文件定义了一个名为 `equipmentFactory` 的模块，其中包含一个名为 `extractBaseFields` 的函数。该函数负责从各种来源对象中提取标准装备字段，去除特定的字段（如 `id` 和 `isCustom`），以便于在不同场景下使用统一的装备数据结构。

## 主要导出/接口
- **导出类型**：无
- **导出函数**：
  - `extractBaseFields(source: Partial<EquipmentItem>): Omit<EquipmentItem, 'id' | 'isCustom'>`
    - `source`：类型为 `Partial<EquipmentItem>`，表示可以接受 `EquipmentItem` 的部分属性。
    - 返回值：类型为 `Omit<EquipmentItem, 'id' | 'isCustom'>`，即 `EquipmentItem` 类型去掉 `id` 和 `isCustom` 属性后的类型。

## 核心实现说明
`extractBaseFields` 函数通过接收一个 `source` 对象，该对象可以是 `EquipmentItem`、`formData` 或 `editingEquipment` 等类型。函数内部通过解构赋值和逻辑或操作来提取并设置标准装备字段。对于一些可能未提供的字段，函数会使用默认值进行填充。

该函数在项目中可能用于从用户输入或编辑的装备数据中提取出核心的装备信息，以便于存储或进一步处理。例如，在创建或更新装备记录时，可能需要使用该函数来确保所有必要的装备字段都被正确设置。

## 注意事项或使用方式
- 使用 `extractBaseFields` 函数时，需要传入一个包含装备信息的对象。
- 该函数会自动处理字段缺失的情况，并填充默认值。
- 在使用该函数之前，确保传入的对象类型正确，且包含必要的装备信息。
