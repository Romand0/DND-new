# src/hooks/useInput.ts

## 功能概述

该文件提供了两个自定义 React Hook：`useNumberInput` 和 `useTextInput`。这两个 Hook 分别用于处理受控输入的字符串和数值状态，以及文本输入。它们旨在提供更好的用户体验，避免常见的输入问题，如输入过程中光标跳转和默认值填充。

`useNumberInput` 钩子解决了原生数字输入框在清空输入时被自动填充为 0 的问题，通过分离“输入态字符串”和“业务态数值”来提供更灵活的输入体验。`useTextInput` 钩子则提供了文本输入的封装，避免了输入过程中 trim 导致的光标跳转和输入未结束就被补默认值的问题。

## 主要导出/接口

### `UseNumberInputOptions`

```typescript
interface UseNumberInputOptions {
  fallback?: number;
  allowEmpty?: boolean;
  parse?: (s: string) => number;
}
```

- `fallback`: 失焦时若 text 为空或 NaN 的补全值。默认 0。
- `allowEmpty`: 是否允许失焦后保持空（text='', value=undefined）。默认 false。
- `parse`: 解析函数，默认 `parseInt(s, 10)`。改 `parseFloat` 可支持小数。

### `UseNumberInputResult`

```typescript
interface UseNumberInputResult {
  text: string;
  value: number | undefined;
  onChange: (s: string) => void;
  onBlur: () => void;
  setExternal: (n: number) => void;
  reset: () => void;
}
```

- `text`: 输入框显示的字符串（输入态，可能为空或部分输入如 "-"）。
- `value`: 当前业务数值；输入无效时为上一个有效值，`allowEmpty` 模式下可能为 `undefined`。
- `onChange`: `onChange` 处理器：只更新 text，不立即兜底。
- `onBlur`: `onBlur` 处理器：text 为空或 NaN 时按 fallback 补全。
- `setExternal`: 外部程序化设置值（同时更新 text 和 value）。
- `reset`: 直接重置为初始值。

### `UseTextInputOptions`

```typescript
interface UseTextInputOptions {
  fallback?: string;
  trimOnBlur?: boolean;
}
```

- `fallback`: 失焦时若 text trim 后为空的补全值。默认 ''（即不补）。
- `trimOnBlur`: 失焦时是否 trim。默认 true。

### `UseTextInputResult`

```typescript
interface UseTextInputResult {
  text: string;
  value: string;
  onChange: (s: string) => void;
  onBlur: () => void;
  setExternal: (s: string) => void;
  reset: () => void;
}
```

- `text`: 输入框显示的字符串。
- `value`: 输入框的值。
- `onChange`: `onChange` 处理器。
- `onBlur`: `onBlur` 处理器。
- `setExternal`: 外部程序化设置值。
- `reset`: 重置为初始值。

## 核心实现说明

`useNumberInput` 和 `useTextInput` 钩子通过 `useState` 和 `useEffect` 实现了状态管理和副作用。`useState` 用于存储输入框的文本和值，而 `useEffect` 用于处理外部初始值的更新和失焦时的逻辑。

这两个钩子都提供了 `onChange` 和 `onBlur` 处理器，用于更新状态和处理输入。`useNumberInput` 钩子还提供了 `setExternal` 和 `reset` 方法，用于外部程序化设置值和重置为初始值。

## 注意事项或使用方式

- 使用 `useNumberInput` 和 `useTextInput` 钩子时，需要传入初始值和可选的配置选项。
- `useNumberInput` 钩子的 `parse` 选项允许自定义数值解析逻辑。
- `useTextInput` 钩子的 `trimOnBlur` 选项允许控制失焦时是否 trim 输入文本。
- 使用 `setExternal` 方法时，需要确保传入的值是有效的，否则可能会导致状态错误。
