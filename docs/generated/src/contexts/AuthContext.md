# src/contexts/AuthContext.tsx

## 功能概述
该文件定义了 `AuthContext`，一个用于管理用户认证状态的 React Context。它负责存储用户信息、令牌、认证状态等，并提供登录、登出和更新用户信息的方法。`AuthContext` 存在于整个应用中，使得任何组件都可以访问和修改认证状态，无需通过 props 逐层传递。

## 主要导出/接口
- `User` 接口：定义了用户的属性，包括 `id`、`username`、`role` 和可选的 `avatar`。
  ```typescript
  interface User {
    id: string;
    username: string;
    role: 'dm' | 'player';
    avatar?: string | null;
  }
  ```
- `AuthContextType` 接口：定义了 `AuthContext` 的类型，包括用户信息、令牌、认证状态、是否为管理员、加载状态、登录、登出和更新用户信息的方法。
  ```typescript
  interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isDM: boolean;
    loading: boolean;
    login: (token: string, user: User) => Promise<void>;
    logout: () => void;
    updateUser: (partial: Partial<User>) => void;
  }
  ```
- `AuthContext`：创建了一个 Context 对象，用于存储和提供认证状态。
- `AuthProvider` 组件：一个 React 组件，用于包裹应用中的所有子组件，并提供 `AuthContext` 的值。
- `useAuth` 钩子：用于在组件中访问 `AuthContext` 的值。

## 核心实现说明
- `AuthProvider` 组件使用 `useState` 和 `useEffect` 钩子来管理用户状态和令牌。它从 `localStorage` 中恢复登录状态，并在组件挂载时验证令牌的有效性。
- `login` 方法用于登录用户，更新状态并保存到 `localStorage`。
- `logout` 方法用于登出用户，清除状态并从 `localStorage` 中移除数据。
- `updateUser` 方法用于更新当前用户信息，并同步到 `localStorage`。
- `useAuth` 钩子允许组件访问 `AuthContext` 的值，而无需直接使用 Context 对象。

## 注意事项或使用方式
- 使用 `AuthProvider` 组件包裹应用中的所有子组件，以确保它们能够访问认证状态。
- 使用 `useAuth` 钩子来访问认证状态和方法。
- 在调用 `login` 和 `logout` 方法时，确保在异步操作完成后更新状态。
