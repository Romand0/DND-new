# src/pages/PlayerInventory.tsx

## 功能概述
该文件实现了玩家端背包页面的功能，负责从后端 API 加载角色卡数据，并展示给用户。该页面承担着展示玩家背包中角色卡信息的职责，是玩家与游戏角色互动的重要界面之一。

## 主要导出/接口
- `PlayerInventory`: React 组件，负责渲染背包页面。
  - `props`: 无
- `fetchAllCharacters`: 异步函数，从后端 API 获取所有角色卡数据。
  - `signature`: `fetchAllCharacters<T extends Character>(): Promise<T[]>`
- `Character`: 类型，定义了角色卡的数据结构。
  - `signature`: `interface Character { id: string; /* 其他属性 */ }`
- `useParams`: React Router DOM 的 hook，用于从 URL 中获取参数。
  - `signature`: `useParams<T>()`
- `useState`: React 的 hook，用于在组件中添加状态。
  - `signature`: `useState<T>(initialValue: T): [state: T, setState: (newValue: T | ((prevState: T) => T)) => void]`
- `useEffect`: React 的 hook，用于在组件挂载后执行副作用操作。
  - `signature`: `useEffect(didUpdate: () => void, dependencies: Array<unknown>): void`

## 核心实现说明
该组件通过 `useParams` 获取 URL 中的 `playerId` 参数，并使用 `useState` 创建 `character`、`loading` 和 `error` 状态。`fetchAllCharacters` 函数用于从后端 API 获取所有角色卡数据，并通过 `find` 方法查找匹配的 `playerId` 的角色卡。

组件使用 `useEffect` 钩子来触发 `loadCharacter` 函数，该函数负责加载数据并更新状态。在数据加载过程中，组件会显示加载动画。如果加载失败，会显示错误信息并提供重试按钮。

当角色卡数据加载成功后，组件会渲染一个包含只读模式的 `CharacterInventory` 组件，并传递 `character` 对象作为属性。

## 注意事项或使用方式
- 该组件依赖于 `fetchAllCharacters` 函数从后端获取数据，确保该函数正确实现并返回正确的数据类型。
- 使用该组件时，需要确保 `playerId` 参数正确传递，否则组件将无法加载角色卡数据。
- 组件内部使用了 `Link` 组件进行页面跳转，确保 `Link` 组件正确配置。
