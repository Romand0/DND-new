# src/components/SpellIdPicker.tsx

## 功能概述
`SpellIdPicker.tsx` 文件定义了一个 React 组件，用于在输入框旁边提供一个“从法术库选取”按钮。用户可以通过该按钮打开一个弹窗，从中选择法术，并自动将法术的 ID 填入输入框中。此组件旨在简化法术 ID 的输入过程，提高用户体验。

## 主要导出/接口
```typescript
interface Props {
  /** 当前 ID 值 */
  value: string;
  /** ID 变更回调 */
  onChange: (id: string) => void;
  /** 可选：选中法术后同步回填名称 */
  onNameHint?: (name: string) => void;
  /** 输入框 CSS class（与宿主保持一致） */
  className?: string;
  /** placeholder */
  placeholder?: string;
}
```

## 核心实现说明
该组件的核心功能是通过弹窗展示法术库，并提供搜索和筛选功能。以下是关键实现说明：

- 使用 `useState` 和 `useEffect` 钩子来管理组件的状态，如弹窗的打开状态、搜索查询、筛选等级、法术列表和加载状态。
- 使用 `fetch` API 从服务器获取法术数据，并在弹窗打开时触发。
- 使用 `useMemo` 钩子来缓存过滤后的法术列表，以提高性能。
- 提供一个 `handlePick` 函数，用于处理法术的选择，并将法术 ID 和名称（如果提供了回调函数）更新到父组件。

该组件与项目其他模块的关系主要体现在其依赖于 `/api/spells` 接口获取法术数据，并且通过 `onChange` 和 `onNameHint` 回调函数与父组件进行交互。

## 注意事项或使用方式
- 组件应作为子组件使用，并传入 `value`、`onChange` 和可选的 `onNameHint`、`className` 和 `placeholder` 属性。
- 确保 `onChange` 回调函数能够正确处理传入的 ID 值。
- 如果需要回填法术名称，应提供 `onNameHint` 回调函数。
- 组件会根据传入的 `className` 和 `placeholder` 属性来设置输入框的样式和提示信息。
