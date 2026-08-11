# src/pages/DataManagement.tsx

## 功能概述

该文件 `DataManagement.tsx` 是一个 React 组件，负责管理游戏数据，包括装备和法术的导入、编辑和保存。它提供了从外部数据源（如 5E 不全书）导入装备和法术的功能，允许用户批量编辑和导入数据，以及通过控制台直接入库数据。

## 主要导出/接口

- `CATEGORIES`: 包含不同类别（如武器、护甲、工具等）的数组。
- `GAME_CATEGORIES`: 包含游戏内可用的类别名称数组。
- `IMPORT_CAT_TO_GAME`: 一个记录，将导入类别映射到游戏类别。
- `PreviewItem`: 装备预览项的接口，包含装备的详细信息。
- `FIELD_TYPES`: 一个记录，定义了不同字段的类型。
- `PROTECTED_FIELDS`: 一个集合，包含受保护的字段名称。
- `DataManagement`: 默认导出的 React 组件，包含以下状态和函数：
  - 状态：
    - `category`: 当前选择的类别。
    - `preview`: 装备预览数据。
    - `selected`: 已选中的装备 ID 集合。
    - `categoryOverrides`: 类别覆盖记录。
    - `loading`: 是否正在加载数据。
    - `importing`: 是否正在导入数据。
    - `result`: 导入结果。
    - `existingNames`: 已存在的装备名称集合。
    - `showBulkPanel`: 是否显示批量编辑面板。
    - `bulkEditJson`: 批量编辑 JSON 字符串。
    - `bulkEditResult`: 批量编辑结果。
    - `spellRing`: 法术环数。
    - `spellPreview`: 法术预览数据。
    - `spellSelected`: 已选中的法术 ID 集合。
    - `spellLoading`: 是否正在加载法术数据。
    - `spellImporting`: 是否正在导入法术。
    - `spellResult`: 法术导入结果。
    - `showSpellBulkPanel`: 是否显示法术批量编辑面板。
    - `spellBulkEditJson`: 法术批量编辑 JSON 字符串。
    - `spellBulkEditResult`: 法术批量编辑结果。
    - `spellTableIdentifier`: 法术表格标识符。
    - `spellTableContent`: 法术表格内容。
    - `spellTableSaveResult`: 法术表格保存结果。
    - `consoleInput`: 控制台输入。
    - `consoleResult`: 控制台执行结果。
    - `consoleExecuting`: 是否正在执行控制台命令。
  - 函数：
    - `fetchPreview`: 获取装备预览数据。
    - `toggleItem`: 切换装备选中状态。
    - `updateCategoryOverride`: 更新类别覆盖。
    - `applyBulkEdit`: 应用批量编辑。
    - `confirmImport`: 确认导入装备。
    - `fetchSpellPreview`: 获取法术预览数据。
    - `toggleSpell`: 切换法术选中状态。
    - `applySpellBulkEdit`: 应用法术批量编辑。
    - `confirmSpellImport`: 确认导入法术。
    - `saveSpellTable`: 保存法术表格。
    - `executeConsole`: 执行控制台命令。

## 核心实现说明

该组件的核心功能是导入和编辑游戏数据。它通过调用 API 接口获取数据，并提供用户界面供用户进行操作。组件使用 React 的状态管理功能来跟踪用户的选择和编辑，并在必要时更新数据。

## 注意事项或使用方式

- 用户需要选择类别并获取预览数据。
- 可以使用批量编辑功能来更新多个装备或法术的属性。
- 可以通过控制台直接入库数据，但需要了解 JSON 格式和 API 接口。
