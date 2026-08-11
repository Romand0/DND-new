# src/pages/CharacterDetail.tsx

## 功能概述

该文件定义了 `CharacterDetail` 组件，负责展示和管理角色的详细信息。它承担着以下职责：

- 展示角色的基本信息，如名称、种族、职业、阵营等。
- 管理角色的属性值、技能、豁免、熟练项等。
- 管理角色的攻击、装备、法术等。
- 提供编辑和更新角色信息的界面。
- 支持导出和删除角色。

## 主要导出/接口

- `CharacterDetail` 组件：负责渲染角色详情页面，包含属性、技能、攻击、装备、法术等信息。
- `renderSpellDice` 函数：用于将法术描述中的骰子表达式转换为可渲染的节点数组。
- `Section` 组件：用于创建可折叠的区块，用于组织页面内容。
- `useEditorState` 钩子：用于管理编辑器状态，如弹窗、编辑器等。
- `characterStore`：用于获取和更新角色数据。
- `spellStore`：用于获取和更新法术数据。
- `equipmentStore`：用于获取和更新装备数据。
- `useEquipmentActions` 钩子：用于处理装备相关的操作，如添加、删除、更新等。

## 核心实现说明

- `CharacterDetail` 组件使用 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。
- 组件通过 `useParams` 和 `useNavigate` 钩子获取路由参数和导航功能。
- 组件使用 `characterStore`、`spellStore` 和 `equipmentStore` 来获取和更新角色、法术和装备数据。
- 组件使用 `useEquipmentActions` 钩子来处理装备相关的操作。
- 组件使用 `renderSpellDice` 函数来渲染法术描述中的骰子表达式。
- 组件使用 `Section` 组件来组织页面内容，使其更易于阅读和管理。

## 注意事项或使用方式

- 该组件需要依赖 `characterStore`、`spellStore` 和 `equipmentStore` 等数据存储模块。
- 组件使用 `useEquipmentActions` 钩子来处理装备相关的操作，需要传入角色 ID 和回调函数。
- 组件使用 `renderSpellDice` 函数来渲染法术描述中的骰子表达式，需要传入法术描述字符串。
