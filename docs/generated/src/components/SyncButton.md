# src/components/SyncButton.tsx

## 功能概述
该文件定义了一个名为 `SyncButton` 的 React 组件，其职责是提供一个按钮，用于同步本地角色数据到云端数据库。该按钮仅在编辑器打开时显示，并且在战斗场景中不显示。同步操作包括检查是否有有效的 DM Token，上传角色卡数据，并显示同步结果。

## 主要导出/接口
- **类型**：
  - `SyncStatus`: `type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';`
  - `SyncResult`: `interface SyncResult { name: string; status: 'success' | 'error' | 'skipped'; count?: number; error?: string; }`
- **函数**：
  - `handleSync`: 异步函数，用于执行同步操作。
  - `getStatusIcon`: 根据同步状态返回相应的图标。
  - `getStatusColor`: 根据同步状态返回相应的按钮颜色。
- **组件**：
  - `Loader2`, `CheckCircle`, `AlertCircle`: 来自 `lucide-react` 的图标组件。
- **Store**：
  - `characterStore`: 用于获取所有角色卡数据的 Store。
  - `editorState`: 用于获取编辑器状态的 Store。
- **常量**：
  - 无

## 核心实现说明
- `SyncButton` 组件使用 `useState` 和 `useEffect` 钩子来管理同步状态和结果。
- `useEffect` 用于订阅 `editorState` 的变化，以便在编辑器状态改变时更新按钮的可见性。
- `handleSync` 函数首先检查是否有有效的 DM Token，然后设置同步状态为 `syncing` 并清空结果。
- 通过 `characterStore` 获取所有角色卡，并使用 `api.batchUpsertCharacters` 函数上传数据。
- 根据同步结果更新状态和结果，并在出现错误时设置错误状态和错误信息。
- `getStatusIcon` 和 `getStatusColor` 函数根据同步状态返回相应的图标和颜色。
- 组件返回一个按钮，其样式和状态根据同步状态动态变化。

## 注意事项或使用方式
- 确保在 `editorState` 变化时更新按钮的可见性。
- 在调用 `handleSync` 函数之前，确保有有效的 DM Token。
- 同步操作可能需要一些时间，请耐心等待。
