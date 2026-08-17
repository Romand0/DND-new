# src/pages/FlowList.tsx

## 功能概述
该文件 `FlowList.tsx` 是一个 React 组件，负责展示和管理流程库中的流程列表。它允许用户查看、搜索、创建、编辑、导出和删除流程。该组件的存在是为了提供一个用户界面，让用户能够方便地与流程库进行交互。

## 主要导出/接口
- `FlowList`: React 组件，负责渲染流程列表界面。
  - `flows`: `useState<FlowDefinition[]>([])`，状态，存储所有流程定义。
  - `search`: `useState<string>('')`，状态，存储搜索关键字。
  - `deleteId`: `useState<string | null>(null)`，状态，存储待删除流程的 ID。
  - `fileInputRef`: `useRef<HTMLInputElement>(null)`，引用，用于文件输入元素。
  - `filtered`: `flows.filter(f => ...)`，函数，根据搜索关键字过滤流程列表。
  - `handleCreate`: `() => void`，函数，处理创建新流程的逻辑。
  - `handleDelete`: `() => void`，函数，处理删除流程的逻辑。
  - `handleExport`: `(flow: FlowDefinition) => void`，函数，处理导出流程的逻辑。
  - `handleImport`: `(file: File) => void`，函数，处理导入流程的逻辑。
  - `formatDate`: `(ts?: number) => string`，函数，格式化时间戳为中文日期格式。

## 核心实现说明
该组件通过 `useState` 和 `useEffect` 钩子管理状态和副作用。`useEffect` 用于订阅流程存储库（`flowStore`），当流程数据发生变化时，更新 `flows` 状态。组件中包含搜索、创建、编辑、导出和删除流程的功能。搜索功能通过过滤 `flows` 状态来实现。创建新流程时，调用 `flowStore.create` 创建新流程，并导航到编辑页面。导出和导入功能分别通过创建 Blob 和读取文件来实现。

## 注意事项或使用方式
- 组件依赖于 `react-router-dom` 的 `useNavigate` 钩子进行页面导航。
- 组件依赖于 `@/contexts/ThemeContext` 的 `useTheme` 钩子获取主题信息。
- 组件依赖于 `@/data/flowStore` 提供的流程存储功能。
- 组件中的搜索功能对流程的名称、描述和标签进行模糊匹配。
- 导出功能将流程导出为 JSON 格式。
- 导入功能允许用户上传 JSON 文件以导入流程。
