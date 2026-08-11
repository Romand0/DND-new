# src/components/AdvDisadvToggle.tsx

## 功能概述
该文件定义了 `AdvDisadvToggle` 组件，该组件用于在游戏中切换和显示手动优/劣势模式。它允许用户手动选择优/劣势模式，并显示自动检测到的优/劣势原因。该组件的存在是为了提供更灵活的游戏体验，让玩家可以根据游戏情况手动调整优/劣势模式。

## 主要导出/接口
```typescript
interface Props {
  /** 当前手动模式 */
  manualMode: ManualMode;
  /** 手动模式变更回调 */
  onChange: (m: ManualMode) => void;
  /** 最终检定模式（合并手动+自动后） */
  mode: 'none' | 'advantage' | 'disadvantage';
  /** 自动检测的原因列表（来自 advantageRules.resolveRollMode） */
  reasons: AdvantageReason[];
  /** 菜单展开时的额外回调（用于重置骰子等），可选 */
  onModeChange?: (m: ManualMode) => void;
}
```

## 核心实现说明
`AdvDisadvToggle` 组件通过 `useState` 钩子管理菜单的显示状态。当用户点击按钮时，会切换菜单的显示状态。组件中定义了 `handleSelect` 函数，用于处理模式选择，并触发模式变更回调。组件的渲染部分包括一个按钮用于显示/隐藏菜单，以及一个下拉菜单显示所有可用的模式选项。

该组件与项目其他模块的关系主要体现在接收来自父组件的 `mode` 和 `reasons` 属性，以及通过回调函数 `onChange` 和可选的 `onModeChange` 与父组件通信。

## 注意事项或使用方式
- 该组件应在父组件中传入 `manualMode`、`onChange`、`mode` 和 `reasons` 属性。
- 当用户手动选择模式时，应调用 `onChange` 回调函数。
- 可选的 `onModeChange` 回调可以在菜单展开时执行额外的操作，如重置骰子等。
