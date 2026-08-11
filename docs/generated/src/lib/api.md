# src/lib/api.ts

## 功能概述

该文件 `src/lib/api.ts` 是一个 API 客户端，负责与 Cloudflare Pages Functions 后端进行通信。它提供了获取和设置认证令牌、发送 API 请求以及与后端进行交互的功能。该文件的存在是为了简化与后端服务的交互，并确保所有请求都带有必要的认证信息。

## 主要导出/接口

### 导出类型

- `AUTH_TOKEN_KEY`: 字符串常量，用于存储 JWT 认证令牌的键。
- `DM_TOKEN_KEY`: 字符串常量，用于存储旧版 DM Token 的键。
- `API_BASE`: 字符串常量，表示 API 基础路径。

### 导出函数

- `getAuthToken()`: 获取存储在 localStorage 中的 JWT 认证令牌。
- `getDmToken()`: 获取存储在 localStorage 中的 DM Token。
- `setDmToken(token: string | null)`: 设置或清除 DM Token。
- `setAuthToken(token: string)`: 设置 JWT 认证令牌。
- `getAuthTokenExport()`: 导出 `getAuthToken` 函数。
- `clearAuthToken()`: 清除 JWT 认证令牌。
- `hasAuthToken()`: 检查是否存在 JWT 认证令牌。
- `authHeaders()`: 构建带有 JWT 或 DM Token 的请求头。
- `apiFetch<T = any>(path: string, options: RequestInit = {})`: 发送 API 请求并返回解析后的数据。
- `fetchCurrentUser<T = any>()`: 获取当前用户信息。
- `fetchAllCharacters<T = any>()`: 获取所有角色卡信息。
- `fetchCharacter<T = any>(id: string)`: 获取指定 ID 的角色卡信息。
- `createCharacter<T = any>(data: T)`: 创建新的角色卡。
- `batchUpsertCharacters(items: any[])`: 批量创建或更新角色卡。
- `updateCharacter<T = any>(id: string, data: T)`: 更新指定 ID 的角色卡。
- `deleteCharacter(id: string)`: 删除指定 ID 的角色卡。
- `fetchAllEquipments<T = any>()`: 获取所有装备信息。
- `fetchEquipment<T = any>(id: string)`: 获取指定 ID 的装备信息。
- `createEquipment<T = any>(data: T)`: 创建新的装备。
- `batchUpsertEquipments(items: any[])`: 批量创建或更新装备。
- `updateEquipment<T = any>(id: string, data: T)`: 更新指定 ID 的装备。
- `deleteEquipment(id: string)`: 删除指定 ID 的装备。
- `fetchAllSpells<T = any>()`: 获取所有法术信息。
- `fetchSpell<T = any>(id: string)`: 获取指定 ID 的法术信息。
- `createSpell<T = any>(data: T)`: 创建新的法术。
- `batchUpsertSpells(items: any[])`: 批量创建或更新法术。
- `updateSpell<T = any>(id: string, data: T)`: 更新指定 ID 的法术。
- `deleteSpell(id: string)`: 删除指定 ID 的法术。
- `hasToken()`: 检查是否存在有效的 JWT 或 DM Token。
- `setToken(token: string | null)`: 设置或清除 JWT 或 DM Token。
- `verifyToken()`: 验证 JWT 或 DM Token。
- `deleteEquipments(ids: string[])`: 删除指定 ID 的装备。
- `fetchAdminUsers<T = any>()`: 获取所有管理员用户信息。
- `updateUserRole<T = any>(id: string, role: 'player' | 'dm')`: 更新用户角色。
- `deleteAdminUser<T = any>(id: string)`: 删除管理员用户。
- `resetUserPassword<T = any>(id: string, password: string)`: 重置用户密码。
- `updateProfile<T = any>(data: { username?: string; avatar?: string })`: 更新当前用户资料。
- `changePassword<T = any>(oldPassword: string, newPassword: string)`: 修改密码。
- `logoutUser<T = any>()`: 退出登录。
- `uploadAvatar<T = { url: string }>(dataUrl: string)`: 上传头像。

### 导出常量

- `AUTH_TOKEN_KEY`
- `DM_TOKEN_KEY`
- `API_BASE`

## 核心实现说明

该文件的核心功能是通过 `apiFetch` 函数发送 API 请求，并处理认证信息。它使用 JWT 或 DM Token 作为认证信息，并在请求头中添加这些信息。`apiFetch` 函数负责解析响应并处理错误。

该文件还提供了对角色卡、装备和法术库的 CRUD 操作，以及对管理员用户的管理功能。这些功能通过调用后端 API 实现。

## 注意事项或使用方式

- 使用 `apiFetch` 函数发送 API 请求时，需要提供请求路径和可选的请求选项。
- 在调用需要认证的 API 时，确保已经设置了 JWT 或 DM Token。
- 使用 `hasAuthToken` 和 `hasToken` 函数检查是否存在有效的认证令牌。
- 在进行敏感操作（如修改密码或删除用户）时，确保已经进行了适当的错误处理。
