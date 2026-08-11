# src/pages/MigrationBackup.tsx

## 功能概述
该文件 `MigrationBackup.tsx` 是一个 React 组件，负责处理数据的迁移和备份功能。它允许用户导出本地数据为 JSON 文件，并从 JSON 文件导入数据到云端数据库。此外，它还支持从云端同步数据到本地。

## 主要导出/接口
- `MigrationBackup`: React 组件，包含以下状态和函数：
  - `migrating`: boolean，表示是否正在迁移数据。
  - `exporting`: boolean，表示是否正在导出数据。
  - `syncing`: boolean，表示是否正在同步数据。
  - `migrateResult`: `{ equipments: number; spells: number; characters: number } | null`，表示迁移结果。
  - `migrateError`: string，表示迁移错误信息。
  - `equipmentCount`: number，表示装备数量。
  - `spellCount`: number，表示法术数量。
  - `characterCount`: number，表示角色数量。
  - `fetchCounts`: async function，用于获取数据数量。
  - `handleExport`: async function，用于导出数据。
  - `downloadJson`: function，用于下载 JSON 数据。
  - `handleImportClick`: function，用于触发文件选择。
  - `handleImportFile`: async function，用于处理文件导入。
  - `handleSyncFromCloud`: async function，用于从云端同步数据。

## 核心实现说明
- `MigrationBackup` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理状态和副作用。
- `fetchCounts` 函数用于从 API 或本地存储获取数据数量。
- `handleExport` 函数用于导出数据，如果 API 不可用，则使用本地存储的数据。
- `downloadJson` 函数用于创建一个可下载的 JSON 文件。
- `handleImportClick` 和 `handleImportFile` 函数用于处理文件导入。
- `handleSyncFromCloud` 函数用于从云端同步数据到本地。

## 注意事项或使用方式
- 用户可以通过点击“导出备份”按钮导出本地数据。
- 用户可以通过点击“导入到云端”按钮导入数据到云端。
- 用户可以通过点击“从云端同步”按钮从云端同步数据到本地。
- 在导入数据之前，请确保已经配置并验证了 DM Token。
