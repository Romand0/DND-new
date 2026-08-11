# src/pages/TradePage.tsx

## 功能概述
该文件定义了交易页面的组件，负责展示角色库，允许用户选择交易主体角色，并进入交易/物资分配弹窗。该页面是用户进行交易操作的主要界面。

## 主要导出/接口
- `formatCurrency(c: Currency): string`: 格式化货币展示
- `TradePage()`: 交易页面组件

### `formatCurrency` 函数
```typescript
function formatCurrency(c: Currency): string {
  const parts: string[] = [];
  if (c.pp > 0) parts.push(`${c.pp}pp`);
  if (c.gp > 0) parts.push(`${c.gp}gp`);
  if (c.sp > 0) parts.push(`${c.sp}sp`);
  if (c.cp > 0) parts.push(`${c.cp}cp`);
  return parts.length > 0 ? parts.join(' ') : '0cp';
}
```

### `TradePage` 组件
```typescript
export default function TradePage() {
  // ...
}
```

## 核心实现说明
`TradePage` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。它从 `characterStore` 获取所有角色数据，并使用 `useMemo` 钩子来过滤和缓存搜索结果。

组件包含以下关键逻辑：
- 从 `characterStore` 加载角色数据并存储在状态中。
- 实现搜索功能，允许用户通过角色名称、职业或种族进行搜索。
- 当用户选择一个角色时，显示一个包含该角色信息的列表项，并显示其货币和装备数量。
- 如果用户选择了某个角色，将显示一个交易弹窗，允许用户进行买入、卖出或分配操作。

该组件与 `TradeModal` 组件交互，后者用于显示交易弹窗。如果用户未找到选择的角色，将显示一个提示信息，并允许用户关闭弹窗。

## 注意事项或使用方式
- 用户可以通过搜索框搜索角色名称、职业或种族。
- 选择一个角色后，可以查看其货币和装备信息。
- 如果需要执行交易操作，请确保已选择有效的角色。
