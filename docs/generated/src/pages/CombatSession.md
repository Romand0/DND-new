# src/pages/CombatSession.tsx

## 功能概述

`CombatSession.tsx` 文件是开源项目中的一个关键组件，负责展示和管理战斗会话。该文件承担以下职责：

- 展示战斗会话的界面，包括参战者列表、先攻表格、沙盘等。
- 管理战斗会话的状态，如参战者信息、回合信息、先攻顺序等。
- 提供与战斗相关的操作，如添加参战者、记录攻击、应用伤害、播放战斗等。

该文件的存在是为了提供一个完整的战斗会话管理功能，方便用户进行角色扮演游戏。

## 主要导出/接口

`CombatSession.tsx` 文件导出以下内容：

- `CombatSession` 组件：负责渲染战斗会话界面和处理用户交互。
- `useActions`、`useCombatInventories`、`useDamageAndHp`、`useInitiative`、`useManualRecord`、`usePlayback`、`useRoundTurn`、`useSurprise`、`useThrownDrop`：战斗相关的 hooks。
- `CombatantList`、`InitiativeTable`、`InitiativeRollDialog`、`InitiativeTiebreakerDialog`、`ManualRecordDialog`、`PlaybackToolbar`、`RewindDialog`、`SurpriseAttackDialog`、`CombatantInfoPanel`：战斗相关的组件。

## 核心实现说明

`CombatSession.tsx` 文件的核心实现包括以下几个方面：

- **状态管理**：使用 React 的 `useState` 和 `useEffect` 钩子来管理战斗会话的状态，如参战者信息、回合信息、先攻顺序等。
- **与项目其他模块的关系**：与 `combatStore`、`characterStore`、`npcTemplateStore`、`battlegroundStore` 等模块进行交互，获取和更新战斗会话数据。
- **被谁引用**：被 `App.tsx` 路由参数调用，用于渲染战斗会话界面。

## 注意事项或使用方式

- 使用 `CombatSession` 组件时，需要传入 `sessionId` 参数，该参数表示当前战斗会话的 ID。
- `CombatSession` 组件需要依赖 `AuthContext`，确保用户具有访问战斗会话的权限。
- `CombatSession` 组件中包含多个 hooks 和组件，需要根据具体需求进行使用。
