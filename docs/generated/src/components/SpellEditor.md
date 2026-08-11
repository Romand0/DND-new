# src/components/SpellEditor.tsx

## 功能概述
该文件定义了一个名为 `SpellEditor` 的 React 组件，用于编辑和创建法术。它承担着用户界面(UI)的角色，允许用户输入和修改法术的相关信息，如名称、环级、学派、施法时间、射程、持续时间、成分、描述、备注等。该组件的存在是为了提供一个直观且功能齐全的界面，让用户能够方便地管理法术库。

## 主要导出/接口
- **类型**：`SpellEditorProps`
  - `spell?: Spell`：可选的 `Spell` 类型对象，用于编辑现有法术。
  - `isOpen: boolean`：布尔值，指示编辑器是否可见。
  - `onClose: () => void`：关闭编辑器的回调函数。
  - `onSave: (spell: Spell, syncToLibrary?: boolean) => Promise<void>`：保存法术的回调函数，返回一个 `Promise`。
  - `showSyncOption?: boolean`：可选的布尔值，指示是否显示同步到法术库的选项。

- **组件**：`SpellEditor`
  - 接受 `SpellEditorProps` 类型的属性。
  - 包含表单输入、下拉选择、复选框、文本区域等元素，用于收集和展示法术信息。
  - 处理保存和关闭操作。

## 核心实现说明
`SpellEditor` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。它通过 `useState` 创建了多个状态变量，如 `formData`（用于存储法术数据）、`classInput`（用于添加新职业的输入）、`saving`（指示是否正在保存）、`error`（用于显示错误信息）等。

组件在渲染时会根据 `isOpen` 状态决定是否显示。如果 `spell` 属性存在，则使用该法术的初始数据填充 `formData`。当 `formData` 发生变化时，会触发 `useEffect` 钩子，用于更新 `formData`。

`handleSave` 函数用于处理保存操作，它会检查必填字段，并调用 `onSave` 回调函数。如果保存成功，则关闭编辑器；如果失败，则设置错误信息。

`handleAddClass` 和 `handleRemoveClass` 函数用于添加和移除可用职业。

## 注意事项或使用方式
- 确保 `onClose` 和 `onSave` 回调函数在组件外部定义。
- `spell` 属性仅在编辑现有法术时提供。
- 使用 `showSyncOption` 属性来控制是否显示同步到法术库的选项。
- 在添加新职业时，请确保输入的职业名称与 `defaultClasses` 数组中的名称匹配。
