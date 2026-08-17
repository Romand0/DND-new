# src/components/ConfigFieldRenderer.tsx

## 功能概述
`ConfigFieldRenderer` 组件负责渲染配置字段，根据不同的字段类型展示不同的输入控件。该组件是配置界面中不可或缺的一部分，用于将配置数据以用户友好的方式呈现给用户，并处理用户输入。

## 主要导出/接口
- **类型**：`ConfigFieldRenderer`
- **函数**：
  - `ConfigFieldRenderer`：渲染配置字段的函数，接受以下参数：
    - `schema: ConfigFieldSchema`：配置字段的 schema 对象，定义了字段的类型、默认值、选项等。
    - `value: any`：当前字段的值。
    - `onChange: (value: any) => void`：当字段值改变时调用的回调函数。
    - `isDark: boolean`：是否启用暗黑模式。
- **组件**：`ConfigFieldRenderer` 组件
- **Store**：无
- **常量**：无

## 核心实现说明
`ConfigFieldRenderer` 组件根据传入的 `schema.type` 属性来决定渲染哪种类型的输入控件。以下是几种主要类型的实现说明：

- **select**：渲染一个下拉选择框，包含 `schema.options` 中定义的选项。
- **number**：渲染一个数字输入框。
- **dice**：渲染一个文本输入框，用于输入骰子表达式，如 `8d6` 或 `2d4+2`。
- **template**：渲染一个文本输入框，用于输入模板字符串。
- **text**：默认渲染一个文本输入框。

组件通过 `onChange` 回调函数来更新字段的值，并传递给父组件。

## 注意事项或使用方式
- 确保 `schema` 参数是有效的 `ConfigFieldSchema` 类型。
- `value` 参数是当前字段的值，如果未提供，则使用 `schema.defaultValue`。
- `onChange` 回调函数用于处理字段值的变更。
- `isDark` 参数用于控制是否启用暗黑模式。
