# src/pages/EquipmentDetail.tsx

## 功能概述
该文件 `EquipmentDetail.tsx` 是一个 React 组件，负责展示单个装备的详细信息。它承担着从后端获取装备数据、展示装备信息、允许管理员编辑和删除装备的职责。该组件的存在是为了提供一个直观的界面，让用户能够查看和管理装备详情。

## 主要导出/接口
- **类型**：`EquipmentItem`
  - `name`: string
  - `category`: string
  - `subtype`: string | null
  - `price`: { amount: number, unit: string }
  - `weight`: number
  - `damageDice`: string | null
  - `damageType`: string | null
  - `acBase`: number | null
  - `strengthReq`: number | null
  - `stealthDisadvantage`: boolean | null
  - `properties`: string[]
  - `description`: string | null
  - `tags`: { key: string, value: string }[]
  - `source`: string | null

- **函数**：
  - `load()`: 异步函数，从后端加载单个装备信息。
  - `handleSave(updatedItem: EquipmentItem)`: 异步函数，保存装备信息的更新。
  - `handleDelete()`: 异步函数，删除装备。
  - `formatPrice()`: 格式化装备价格显示。

- **组件**：
  - `EquipmentEditor`: 用于编辑装备信息的组件。

- **Store**：无

- **常量**：无

## 核心实现说明
该组件使用 React 的 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。它通过 `useParams` 钩子获取装备的 ID，并通过 `apiFetch` 函数从后端获取装备信息。组件还提供了编辑和删除装备的功能，这些功能需要管理员权限。

该组件与 `AuthContext` 上下文一起使用，以检查用户是否有权限进行编辑和删除操作。它还依赖于 `EquipmentEditor` 组件来编辑装备信息。

## 注意事项或使用方式
- 该组件在加载装备信息时显示加载状态，如果加载失败，则显示错误信息。
- 如果用户没有找到装备，则显示一条消息。
- 管理员可以通过点击编辑按钮打开 `EquipmentEditor` 组件来编辑装备信息。
- 管理员可以通过点击删除按钮确认删除操作。
- 删除操作是不可逆的。
