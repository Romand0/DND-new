# src/data/equipmentWear.ts

## 功能概述
该文件实现了角色装备穿戴和卸下的逻辑。它负责判断装备是否可穿戴、检查装备是否允许与服装效果兼容、查找特定装备、穿戴和卸下装备，并更新角色的装备状态。

## 主要导出/接口
- `isWearable(item: { category?: string; subtype?: string }): boolean`
  - 判断装备是否可穿戴（护甲或服装）。
- `canWearWithOutfit(armor: { subtype?: string; name?: string }): boolean`
  - 判断护甲是否允许服装效果生效。
- `findEquip(char: Character, equipId: string)`
  - 查找装备：优先使用 `childId`，如果不存在则使用 `id`。
- `wearEquipment(charId: string, equipId: string): { success: boolean; message: string }`
  - 穿戴装备，返回操作成功与否的信息。
- `unwearEquipment(charId: string, equipId: string): { success: boolean; message: string }`
  - 卸下装备，返回操作成功与否的信息。

## 核心实现说明
该文件的核心逻辑包括判断装备是否可穿戴、查找装备、穿戴和卸下装备。它依赖于 `characterStore` 来获取和保存角色数据。以下是一些关键点：

- `isWearable` 函数根据装备的类别和子类别判断是否可穿戴。
- `canWearWithOutfit` 函数根据护甲的子类别和名称判断是否允许服装效果生效。
- `findEquip` 函数通过角色的装备列表查找特定装备。
- `wearEquipment` 和 `unwearEquipment` 函数分别用于穿戴和卸下装备，并更新角色的装备状态。

该模块被 `characterStore` 引用，用于处理角色数据的保存和获取。

## 注意事项或使用方式
- 在调用 `wearEquipment` 和 `unwearEquipment` 函数之前，确保角色和装备存在。
- 使用 `findEquip` 函数来查找装备时，应优先使用 `childId`。
- 在穿戴和卸下装备后，应确保更新角色的装备状态，包括槽位和标签。
