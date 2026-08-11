# src/data/advantageRules.ts

## 功能概述

该文件定义了一个注册式优劣势引擎，它是一个纯函数模块，不依赖于React或store。该模块的主要职责是提供场景匹配、上下文定义、检测器注册和内置检测器等功能，用于判断战斗中的优劣势条件。

## 主要导出/接口

- **类型**:
  - `Combatant`: 战斗者类型
  - `NpcAttack`: NPC 攻击类型
  - `CheckScene`: 检查场景类型
  - `CheckSceneGroup`: 检查场景组类型
  - `AdvantageReason`: 优劣势原因类型
  - `AdvantageResult`: 优劣势结果类型
  - `ManualMode`: 手动模式类型
  - `PendingAdvantageSource`: 待消费优劣势来源类型
  - `Attack`: 攻击类型
  - `Character`: 角色类型

- **函数**:
  - `sceneMatches(sourceScene: CheckScene | CheckSceneGroup | 'any', ctxScene: CheckScene): boolean`: 判断场景是否匹配
  - `registerDetector(name: string, fn: AdvantageDetector): void`: 注册检测器
  - `unregisterDetector(name: string): void`: 注销检测器
  - `listDetectors(): string[]`: 列出所有注册的检测器
  - `detectAdvantage(ctx: AdvantageContext): AdvantageResult`: 检测优劣势
  - `resolveRollMode(manual: ManualMode, auto: AdvantageResult): { mode: 'none' | 'advantage' | 'disadvantage'; reasons: AdvantageReason[] }`: 解析投掷模式
  - `getMatchedPendingSourceIds(auto: AdvantageResult): string[]`: 从自动结果中提取匹配的待消费优劣势来源ID

- **组件/Store/常量**:
  - `SCENE_GROUPS`: 场景组到具体场景的映射
  - `AdvantageContext`: 优劣势上下文接口
  - `AdvantageDetector`: 优劣势检测器类型

## 核心实现说明

该模块的核心逻辑包括场景匹配、上下文定义、检测器注册和内置检测器。它通过`sceneMatches`函数实现场景匹配，通过`AdvantageContext`接口定义上下文，通过`registerDetector`和`unregisterDetector`函数注册和注销检测器，并通过内置的检测器如`detectEquipment`、`detectPositional`和`detectPending`来判断优劣势。

该模块与项目其他模块的关系主要体现在通过检测器接口与其他模块交互，例如`CombatAttackModal`模块迁移了武器辅助函数到该模块内部使用。

该模块被`detectAdvantage`函数引用，该函数遍历所有注册的检测器并收集优劣势结果。

## 注意事项或使用方式

- 使用`registerDetector`函数注册自定义检测器。
- 使用`detectAdvantage`函数检测优劣势。
- 使用`resolveRollMode`函数解析投掷模式。
- 使用`getMatchedPendingSourceIds`函数从自动结果中提取匹配的待消费优劣势来源ID。
