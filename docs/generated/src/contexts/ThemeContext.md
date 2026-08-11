# src/contexts/ThemeContext.tsx

## 功能概述
该文件定义了一个主题上下文（Theme Context），用于在 React 应用中提供和共享主题状态。它允许组件访问当前主题，并能够切换或设置主题。这个上下文的存在是为了实现主题切换功能，使得应用能够根据用户的偏好或系统设置自动切换主题。

## 主要导出/接口
- `ThemeContext`: 创建了一个上下文对象，用于存储主题相关的状态和方法。
  - `ThemeContextType`:
    - `theme`: 当前主题类型，可以是 `'dark'` 或 `'light'`。
    - `toggleTheme`: 一个函数，用于切换当前主题。
    - `setTheme`: 一个函数，用于设置当前主题。
- `THEME_KEY`: 用于在本地存储中存储当前主题的键名。
- `ThemeProvider`: 一个 React 组件，用于提供主题上下文。
  - `children`: 一个 ReactNode，表示 ThemeProvider 的子组件。
- `useTheme`: 一个自定义钩子，用于在组件中访问主题上下文。

## 核心实现说明
- `ThemeProvider` 组件负责初始化主题状态，并存储在本地存储中。它使用 `useState` 和 `useEffect` 钩子来管理主题状态，并在主题改变时更新 DOM 和本地存储。
- `toggleTheme` 函数用于切换当前主题，它将当前主题设置为与当前主题相反的值。
- `setTheme` 函数用于设置当前主题，它接受一个新的主题值并更新状态。
- `useTheme` 钩子允许组件访问主题上下文，如果不在 `ThemeProvider` 的作用域内，则会抛出错误。

## 注意事项或使用方式
- 使用 `ThemeProvider` 组件包裹应用的最顶层组件，以确保所有子组件都能访问到主题上下文。
- 使用 `useTheme` 钩子来访问主题状态和操作函数。
- 在切换或设置主题之前，请确保当前组件处于 `ThemeProvider` 的作用域内。
