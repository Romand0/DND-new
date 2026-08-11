# src/pages/DicePage.tsx

## 功能概述
`DicePage.tsx` 文件是项目中的一个页面组件，负责展示和操作虚拟骰子。该页面允许用户选择不同类型的骰子（如4面、6面、8面等），进行单次掷骰或批量掷骰，并展示掷骰结果和历史记录。

## 主要导出/接口
- **`DiceProps` 接口**：
  - `type: number`: 骰子的类型（如4、6、8等）。
  - `size?: number`: 骰子的大小，默认为100。
  - `onRoll: (value: number) => void`: 单次掷骰的回调函数，传入掷出的数值。
  - `onBatchRequest: () => void`: 批量掷骰的请求函数。
  - `result: number | null`: 骰子的当前结果，如果未掷则值为null。

- **`DiceShape` 组件**：
  - `type: number`: 骰子的类型。
  - `size: number`: 骰子的大小。

- **`BatchMode` 类型**：
  - `sum`: 累加模式。
  - `independent`: 独立模式。

- **`BatchResult` 接口**：
  - `sides: number`: 骰子的面数。
  - `values: number[]`: 掷骰结果数组。
  - `total: number`: 结果总和。
  - `mode: BatchMode`: 掷骰模式。

- **`RollEntry` 接口**：
  - `id: number`: 记录的唯一标识。
  - `dice: string`: 骰子类型。
  - `values: number[]`: 掷骰结果数组。
  - `total: number`: 结果总和。
  - `time: string`: 掷骰时间。
  - `mode: BatchMode`: 掷骰模式。

## 核心实现说明
- `Dice` 组件负责展示单个骰子，并处理掷骰逻辑。它使用 `useState` 和 `useEffect` 钩子来管理状态和副作用。
- `DiceShape` 组件根据传入的骰子类型生成对应的 SVG 图形。
- `BatchRollModal` 组件用于展示批量掷骰的模态窗口，允许用户设置掷骰次数、面数和模式。
- `DicePage` 组件是页面的主组件，它管理所有骰子的状态，并处理掷骰结果和历史记录。

## 注意事项或使用方式
- 用户可以通过点击骰子进行单次掷骰，或长按骰子进行批量掷骰。
- 用户可以通过模态窗口设置批量掷骰的参数。
- 页面会展示掷骰结果和历史记录。
