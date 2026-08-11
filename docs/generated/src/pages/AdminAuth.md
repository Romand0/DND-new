# src/pages/AdminAuth.tsx

## 功能概述
该文件 `AdminAuth.tsx` 是一个 React 组件，负责管理管理员认证功能。它允许用户输入和管理 DM Token，用于验证和管理编辑权限。该组件存在是为了确保只有经过验证的管理员才能进行数据编辑，从而保护数据的安全性和完整性。

## 主要导出/接口
- `AdminAuth`: React 组件，用于渲染管理员认证界面。
  - `token`: `string` - 当前输入的 DM Token。
  - `saved`: `boolean` - 表示 Token 是否已保存。
  - `error`: `string` - 错误信息。
  - `verifying`: `boolean` - 表示是否正在验证 Token。
  - `verified`: `boolean | null` - 表示 Token 是否验证成功。
  - `persistedVerified`: `boolean` - 表示 Token 是否已持久化验证。

## 核心实现说明
该组件的核心逻辑包括 Token 的输入、保存、验证以及 Token 验证结果的显示。它使用 `useState` 和 `useEffect` 钩子来管理组件的状态和行为。

- **状态管理**:
  - 使用 `useState` 钩子来管理 `token`、`saved`、`error`、`verifying`、`verified` 和 `persistedVerified` 状态。
  - 使用 `useEffect` 钩子从本地存储中获取已存储的 Token。

- **与项目其他模块的关系**:
  - 通过 `api` 模块与后端进行交互，包括设置 Token、验证 Token 和触发 Token 变更事件。
  - 使用 `useNavigate` 钩子进行页面导航。

- **被谁引用**:
  - 该组件可能被其他需要管理员权限的页面或组件引用，以确保只有经过验证的管理员才能访问。

## 注意事项或使用方式
- 用户需要在输入框中输入 DM Token。
- 点击“保存”按钮将 Token 保存到本地存储并触发 Token 变更事件。
- 点击“验证 Token”按钮将验证 Token 的有效性。
- 如果 Token 验证成功，将显示“Token 有效”信息；如果失败，将显示“Token 无效或后端未配置”信息。
- 点击“清空”按钮将清除 Token 并切换到玩家模式。
