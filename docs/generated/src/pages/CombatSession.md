# src/pages/CombatSession.tsx

## 功能概述

`CombatSession.tsx` 文件是开源项目中的一个关键组件，负责展示和管理战斗会话。它承担以下职责：

- 展示战斗会话的详细信息，包括参战者列表、回合记录、沙盘等。
- 提供对战斗会话的编辑功能，如添加/删除参战者、记录攻击/伤害、管理先攻等。
- 支持放映模式，允许用户回放战斗过程。
- 提供与战斗相关的辅助功能，如协助、突袭、回溯等。

## 主要导出/接口

该文件导出以下内容：

- `CombatSession` 组件：负责渲染战斗会话界面，处理用户交互和状态管理。
- 使用了多个 hooks 和组件：
  - `useParams` 和 `useNavigate`：用于获取路由参数和导航。
  - `useAuth`：用于获取用户权限信息。
  - `useState`、`useEffect`、`useRef`、`useMemo`：用于管理组件状态和副作用。
  - `@/hooks/combat` 中的 hooks：用于处理战斗相关的逻辑，如使用动作、管理先攻、记录攻击等。
  - `@/components/combat` 中的组件：用于展示战斗相关的界面元素，如参战者列表、先攻表格、攻击/伤害/法术弹窗等。
  - `@/data/combatStore`、`@/data/characterStore`、`@/data/npcTemplateStore`、`@/data/battlegroundStore`：用于访问战斗数据、角色数据、NPC 模板数据和沙盘数据。
  - `@/types/character`、`@/types/combat`、`@/types/battleground`：用于定义与战斗相关的数据类型。

## 核心实现说明

`CombatSession` 组件的核心实现包括以下几个方面：

- 状态管理：使用 `useState` 和 `useRef` 管理组件的各种状态，如战斗记录、参战者信息、回合信息、放映模式状态等。
- 与项目其他模块的关系：与 `combatStore`、`characterStore`、`npcTemplateStore`、`battlegroundStore` 等模块交互，获取和更新数据。
- 被谁引用：被 `App.tsx` 路由参数 `sessionId` 引用，用于展示特定战斗会话的界面。

## 注意事项或使用方式

- 该组件需要用户具有管理员权限才能访问。
- 在放映模式下，用户可以回放战斗过程，并使用回溯功能撤销操作。
- 用户可以添加/删除参战者、记录攻击/伤害、管理先攻等。
- 用户可以切换到模拟模式，进行更自由的战斗模拟。
