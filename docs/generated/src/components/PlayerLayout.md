# src/components/PlayerLayout.tsx

## 功能概述
该文件定义了玩家端布局组件 `PlayerLayout`，其职责是提供一个精简的导航栏，不显示角色卡库和剧情笔记，为玩家端页面提供基础布局。该组件的存在是为了确保玩家端页面的一致性和用户体验。

## 主要导出/接口
- 类型：无
- 函数：无
- 组件：
  - `PlayerLayout`：玩家端布局组件
    ```typescript
    export default function PlayerLayout() {
      return (
        <div className="min-h-screen dark:bg-bg-dark light:bg-bg-light">
          <Navbar variant="player" />
          <main className="pt-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Outlet />
            </div>
          </main>
        </div>
      );
    }
    ```
- Store：无
- 常量：无

## 核心实现说明
`PlayerLayout` 组件通过引入 `Outlet` 组件，允许其子组件动态地渲染到页面中。组件中使用了条件类名，根据主题模式（暗色或亮色）来设置背景颜色。`Navbar` 组件被导出为 `variant="player"`，表示这是一个针对玩家端的导航栏。

该组件与项目其他模块的关系主要体现在：
- 通过 `Outlet` 组件，`PlayerLayout` 可以接收并渲染任何子组件。
- `Navbar` 组件作为 `PlayerLayout` 的子组件，负责提供导航功能。

`PlayerLayout` 被以下模块引用：
- 任何需要玩家端布局的页面组件。

## 注意事项或使用方式
- 使用 `PlayerLayout` 组件时，应确保其子组件正确地使用 `Outlet` 组件来渲染内容。
- `PlayerLayout` 组件应在需要玩家端布局的页面组件中使用，以确保页面布局的一致性。
