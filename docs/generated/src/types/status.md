# src/types/status.ts

## 功能概述

该文件定义了 D&D 状态效果系统的数据结构，包括效果、条件检测器、状态定义、状态实例、状态库和状态管理器。这些定义构成了状态系统的核心，用于管理游戏中的状态效果，如失能、速度减半等。

## 主要导出/接口

### 效果（Effect）

- **类型**: `EffectType`
- **函数**: 无
- **组件**: 无
- **Store**: 无
- **常量**: 无
- **签名**:
  ```typescript
  export type EffectType =
    | 'action_block'
    | 'bonus_action_block'
    | 'reaction_block'
    | 'concentration_break'
    | 'concentration_block'
    | 'speech_block'
    | 'initiative_disadvantage'
    | 'speed_set'
    | 'speed_halved'
    | 'speed_zero'
    | 'save_disadvantage'
    | 'check_disadvantage'
    | 'attack_disadvantage'
    | 'attack_advantage'
    | 'damage_vulnerability'
    | 'damage_resistance'
    | 'damage_immunity'
    | 'sight_block'
    | 'hearing_block'
    | 'custom';
  ```

- **结构**:
  ```typescript
  export interface Effect {
    id: string;
    type: EffectType;
    target: 'self' | 'allies' | 'enemies' | 'all';
    config?: Record<string, any>;
    description?: string;
  }
  ```

### 条件检测器（ConditionChecker）

- **类型**: `CheckerType`
- **函数**: 无
- **组件**: 无
- **Store**: 无
- **常量**: 无
- **签名**:
  ```typescript
  export type CheckerType =
    | 'manual'
    | 'hp_threshold'
    | 'save_success'
    | 'save_failure'
    | 'turn_count'
    | 'caster_dismiss'
    | 'concentration_break'
    | 'rest'
    | 'time_passed'
    | 'custom';
  ```

- **结构**:
  ```typescript
  export interface ConditionChecker {
    type: CheckerType;
    config?: Record<string, any>;
    description: string;
  }
  ```

### 状态定义（StatusDefinition）

- **类型**: `StatusDefinition`
- **函数**: 无
- **组件**: 无
- **Store**: 无
- **常量**: 无
- **签名**:
  ```typescript
  export interface StatusDefinition {
    id: string;
    name: string;
    description: string;
    shortDescription?: string;
    startTrigger: ConditionChecker;
    endTrigger: ConditionChecker;
    duration: {
      type: DurationType;
      value?: number;
    };
    effects: Effect[];
    stacking?: {
      rule: 'replace' | 'stack' | 'ignore';
      maxStacks?: number;
    };
    ui?: {
      badgeColor?: string;
      icon?: string;
    };
  }
  ```

### 状态实例（StatusInstance）

- **类型**: `StatusInstance`
- **函数**: 无
- **组件**: 无
- **Store**: 无
- **常量**: 无
- **签名**:
  ```typescript
  export interface StatusInstance {
    instanceId: string;
    definitionId: string;
    targetId: string;
    scope: StatusScope;
    combatId?: string;
    isActive: boolean;
    declaredAt: number;
    declaredEndAt?: number;
    expiresAt?: number;
    metadata?: Record<string, any>;
  }
  ```

### 状态库（StatusLibrary）

- **类型**: `StatusLibrary`
- **函数**: `register`, `get`, `list`, `findByEffect`
- **组件**: 无
- **Store**: 无
- **常量**: 无
- **签名**:
  ```typescript
  export interface StatusLibrary {
    register(definition: StatusDefinition): void;
    get(id: string): StatusDefinition | undefined;
    list(): StatusDefinition[];
    findByEffect(effectType: EffectType): StatusDefinition[];
  }
  ```

### 状态管理器（StatusManager）

- **类型**: `StatusManager`
- **函数**: `declareStart`, `declareEnd`, `getActiveStatuses`, `hasEffect`, `getEffects`, `advanceRound`, `cleanupExpired`
- **组件**: 无
- **Store**: 无
- **常量**: 无
- **签名**:
  ```typescript
  export interface StatusManager {
    declareStart(
      definitionId: string,
      targetId: string,
      scope: StatusScope,
      combatId?: string
    ): StatusInstance;
    declareEnd(instanceId: string): StatusInstance | null;
    getActiveStatuses(targetId: string, scope?: StatusScope): StatusInstance[];
    hasEffect(targetId: string, effectType: EffectType, scope?: StatusScope): boolean;
    getEffects(targetId: string, scope?: StatusScope): Effect[];
    advanceRound(combatId: string): void;
    cleanupExpired(): void;
  }
  ```

### 辅助类型

- **状态变更事件（StatusChangeEvent）**: 用于订阅/通知
- **状态变更监听器（StatusChangeListener）**: 无

## 核心实现说明

该文件定义了 D&D 状态效果系统的数据结构，包括效果、条件检测器、状态定义、状态实例、状态库和状态管理器。这些定义构成了状态系统的核心，用于管理游戏中的状态效果，如失能、速度减半等。

状态定义描述了状态的基本信息，包括名称、描述、效果和持续时间等。状态实例是状态在游戏中的具体应用，包括状态激活的时间、持续时间、效果等。状态库用于存储和管理所有状态定义，状态管理器用于处理状态的声明、结束和查询等操作。

## 注意事项或使用方式

- 状态定义应包含所有必要的信息，以便状态管理器正确处理状态。
- 状态实例应正确设置状态激活的时间、持续时间、效果等。
- 状态库应包含所有可用的状态定义，以便状态管理器可以查询和使用它们。
- 状态管理器应正确处理状态的声明、结束和查询等操作。
