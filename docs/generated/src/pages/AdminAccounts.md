# src/pages/AdminAccounts.tsx

## 功能概述

该文件 `AdminAccounts.tsx` 是一个 React 组件，负责展示和管理所有注册账号的信息。它允许管理员查看用户列表，修改用户权限，重置用户密码以及删除用户。该组件的存在是为了提供一个安全的界面，让管理员能够有效地管理用户账户，同时确保只有经过验证的管理员才能执行这些操作。

## 主要导出/接口

- `UserRow` 接口：定义了用户行数据的结构。
  ```typescript
  interface UserRow {
    id: string;
    username: string;
    role: 'player' | 'dm';
    createdAt: number;
    online: boolean;
  }
  ```

- `ModalState` 类型：定义了模态框的状态类型。
  ```typescript
  type ModalState =
    | { type: 'role'; user: UserRow }
    | { type: 'delete'; user: UserRow }
    | { type: 'password'; user: UserRow }
    | null;
  ```

- `AdminAccounts` 组件：负责渲染用户列表和管理操作。
  - `loadUsers` 函数：异步加载用户数据。
  - `handleRoleChange` 函数：更新用户角色。
  - `handleDelete` 函数：删除用户。
  - `handleResetPassword` 函数：重置用户密码。
  - `closeModal` 函数：关闭模态框。
  - `isSelf` 函数：检查当前用户是否是自身账号。

## 核心实现说明

该组件通过 `useState` 和 `useCallback` 钩子来管理组件的状态和副作用。`useEffect` 钩子用于在组件挂载时加载用户数据。组件使用 `useAuth` 钩子从 `AuthContext` 中获取当前用户信息。

组件的核心逻辑包括：
- 加载用户数据并展示在表格中。
- 提供修改用户权限、重置密码和删除用户的操作。
- 使用模态框来展示和执行上述操作。

该组件与项目其他模块的关系：
- 通过 `api` 模块与后端进行交互。
- 通过 `AuthContext` 获取当前用户信息。

该组件被 `AdminContext` 或其他需要管理员权限的组件引用。

## 注意事项或使用方式

- 组件仅对持有并验证 DM Token 的管理员可见。
- 修改权限或重置密码后，用户需要重新登录以应用更改。
- 删除用户操作不可撤销。
- 新密码长度至少为 6 位。
