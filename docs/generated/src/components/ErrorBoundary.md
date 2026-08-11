# src/components/ErrorBoundary.tsx

## 功能概述
`ErrorBoundary.tsx` 文件定义了一个 React 组件 `ErrorBoundary`，该组件用于捕获其子组件树中发生的 JavaScript 错误，并显示一个备用的 UI。它主要用于提升用户体验，在发生错误时提供更友好的错误信息，而不是让整个应用崩溃。

## 主要导出/接口
- **类型**：`Props` 和 `State`
- **函数**：`getDerivedStateFromError` 和 `componentDidCatch`
- **组件**：`ErrorBoundary`
- **常量**：无

```typescript
interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}
```

## 核心实现说明
`ErrorBoundary` 组件通过以下方式实现错误捕获和展示：

- **状态管理**：组件内部维护一个 `State` 对象，包含 `hasError` 和 `error` 两个属性。`hasError` 用于标识是否发生了错误，`error` 用于存储错误信息。
- **错误捕获**：`getDerivedStateFromError` 静态方法在发生错误时被调用，用于更新状态，将 `hasError` 设置为 `true` 并存储错误信息。
- **错误处理**：`componentDidCatch` 生命周期方法用于记录错误信息到控制台。
- **渲染逻辑**：如果 `hasError` 为 `true`，则渲染 `fallback` 属性指定的备用 UI，否则渲染子组件 `children`。

`ErrorBoundary` 组件可以捕获其子组件树中的错误，并在发生错误时显示一个自定义的错误信息界面。它通常被用于包裹可能抛出错误的组件，以避免错误导致整个应用崩溃。

## 注意事项或使用方式
- 使用 `ErrorBoundary` 时，应确保其子组件可能抛出错误。
- `fallback` 属性可以自定义错误发生时的备用 UI。
- `ErrorBoundary` 应该被放置在可能发生错误的组件树顶层。
