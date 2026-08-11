# src/pages/PlayerView.tsx

## 功能概述
`PlayerView.tsx` 文件是玩家端只读页面的实现，负责从后端 API 加载特定角色的卡数据。该页面允许用户查看角色的详细信息，但不允许修改。页面存在的原因是为了提供一个展示角色信息的界面，让玩家能够查看和管理自己的角色。

## 主要导出/接口
- `PlayerView`: React 组件，负责渲染角色信息页面。
  - `props`: 无
- `useParams`: React Router 的 hook，用于从 URL 中获取参数。
  - `playerId`: 字符串类型，表示角色的唯一标识符。
- `useState`: React 的 hook，用于在组件中添加状态。
  - `character`: `Character | null` 类型，表示当前角色的信息。
  - `loading`: 布尔类型，表示数据是否正在加载。
  - `error`: `string | null` 类型，表示加载过程中可能出现的错误信息。
- `fetchAllCharacters`: 从 `@/lib/api` 模块导出的异步函数，用于从后端 API 获取所有角色信息。
  - 返回值类型：`Promise<Character[]>`
- `CharacterDetail`: 从 `@/pages/CharacterDetail` 导出的 React 组件，用于展示角色的详细信息。
  - `readOnly`: 布尔类型，表示是否允许编辑角色信息。
  - `externalCharacter`: `Character` 类型，表示外部传入的角色信息。

## 核心实现说明
`PlayerView` 组件通过 `useParams` 获取 URL 中的 `playerId` 参数，然后使用 `useState` 初始化角色信息、加载状态和错误信息。组件在首次渲染时调用 `loadCharacter` 函数，该函数异步获取所有角色信息，并尝试找到匹配 `playerId` 的角色。如果找到，则更新 `character` 状态；如果未找到或发生错误，则更新 `error` 状态。

组件使用 `useEffect` 钩子监听 `playerId` 的变化，以便在 `playerId` 发生变化时重新加载数据。

当数据加载完成且没有错误时，组件会渲染角色信息。如果数据正在加载，则显示加载动画；如果发生错误，则显示错误信息并提供重试按钮。

## 注意事项或使用方式
- 确保 `playerId` 参数正确传递到 `PlayerView` 组件。
- 在 `fetchAllCharacters` 函数中，确保正确处理异步请求和错误处理。
- `CharacterDetail` 组件应正确处理 `readOnly` 和 `externalCharacter` 属性。
