// D&D 状态效果系统 —— DSL 接口定义
// 核心设计理念：状态 = 声明周期（开始+结束）+ 效果列表 + 条件检测器

// ======================
// 一、效果（Effect）—— 状态的"作用"
// ======================

/** 效果类型枚举 —— 可扩展，目前预留核心能力占位 */
export type EffectType =
  // 动作系统（预留）
  | 'action_block'           // 阻止动作
  | 'bonus_action_block'     // 阻止附赠动作（预留）
  | 'reaction_block'         // 阻止反应（预留）
  // 专注系统（预留）
  | 'concentration_break'    // 打断已有专注
  | 'concentration_block'    // 无法开始新的专注（预留）
  // 言语能力
  | 'speech_block'           // 无法说话
  // 先攻
  | 'initiative_disadvantage' // 先攻掷骰劣势
  // 移动（预留）
  | 'speed_set'              // 速度设为特定值
  | 'speed_halved'           // 速度减半（预留）
  | 'speed_zero'             // 速度归零（预留）
  // 豁免/检定（预留）
  | 'save_disadvantage'      // 特定豁免劣势（预留）
  | 'check_disadvantage'     // 特定检定劣势（预留）
  // 攻击（预留）
  | 'attack_disadvantage'    // 攻击劣势（预留）
  | 'attack_advantage'       // 攻击优势（预留）
  // 伤害（预留）
  | 'damage_vulnerability'   // 易伤（预留）
  | 'damage_resistance'      // 抗性（预留）
  | 'damage_immunity'        // 免疫（预留）
  // 感知（预留）
  | 'sight_block'            // 目盲（预留）
  | 'hearing_block'          // 耳聋（预留）
  // 其他
  | 'custom';                // 自定义效果（由具体状态定义解释）

/** 效果定义 —— 状态的"原子操作" */
export interface Effect {
  id: string;                    // 效果唯一标识（如 "incapacitated.action_block"）
  type: EffectType;            // 效果类型
  target: 'self' | 'allies' | 'enemies' | 'all';  // 效果目标范围
  config?: Record<string, any>; // 效果配置参数（预留扩展）
  description?: string;          // 人类可读描述
}

// ======================
// 二、条件检测器（Condition Checker）—— 声明周期的" gate"
// ======================

/** 检测器类型 —— 决定状态何时开始/结束 */
export type CheckerType =
  | 'manual'              // 手动触发（DM/玩家主动声明）
  | 'hp_threshold'        // HP 阈值（如 HP<=0 时昏迷）
  | 'save_success'        // 豁免成功（如死亡豁免成功 3 次恢复）
  | 'save_failure'        // 豁免失败（如死亡豁免失败 3 次死亡）
  | 'turn_count'          // 回合数（如持续 N 回合）
  | 'caster_dismiss'      // 施法者解除（如专注法术）
  | 'concentration_break' // 专注被打断
  | 'rest'                // 休息（短休/长休）
  | 'time_passed'         // 现实时间流逝
  | 'custom';             // 自定义逻辑（由具体状态定义）

/** 条件检测器配置 */
export interface ConditionChecker {
  type: CheckerType;
  /** 检测器配置参数 */
  config?: Record<string, any>;
  /** 人类可读的条件描述 */
  description: string;
}

// ======================
// 三、状态定义（StatusDefinition）—— 静态编码
// ======================

/** 状态持续时间类型 */
export type DurationType =
  | 'instantaneous'   // 立即（如圣言术的瞬间效果）
  | 'rounds'          // 持续 N 回合
  | 'minutes'         // 持续 N 分钟（战斗外）
  | 'hours'           // 持续 N 小时
  | 'permanent'       // 永久（直到条件满足）
  | 'concentration';  // 需要专注维持

/** 状态定义 —— 编码在数据库中的"状态模板" */
export interface StatusDefinition {
  id: string;                          // 唯一标识（如 "incapacitated"）
  name: string;                         // 显示名称（如 "失能"）
  description: string;                  // 详细描述
  shortDescription?: string;            // 简短描述（UI 用）

  // --- 生命周期 ---
  /** 状态开始声明的触发条件 */
  startTrigger: ConditionChecker;
  /** 状态结束声明的触发条件 */
  endTrigger: ConditionChecker;

  // --- 持续时间 ---
  duration: {
    type: DurationType;
    value?: number;      // 具体数值（如 10 回合、1 小时）
  };

  // --- 核心：效果列表 ---
  effects: Effect[];

  /** 施加该状态时，需要联动写入参战者的字段补丁 */
  combatantPatch?: Record<string, any>;

  // --- 可选：叠加规则 ---
  stacking?: {
    rule: 'replace' | 'stack' | 'ignore';  // 同名状态叠加规则
    maxStacks?: number;                      // 最大叠加层数
  };

  // --- 可选：视觉/UI ---
  ui?: {
    badgeColor?: string;    // 状态标签颜色（如 "purple"）
    icon?: string;          // 图标标识
  };
}

// ======================
// 四、状态实例（StatusInstance）—— 运行时数据
// ======================

/** 适用域：全域（Character）vs 局域（Combatant） */
export type StatusScope = 'global' | 'combat';

/** 状态实例 —— 附着在角色/参战者上的"激活状态" */
export interface StatusInstance {
  // --- 关联 ---
  instanceId: string;           // 实例唯一 ID
  definitionId: string;         // 关联的状态定义 ID
  targetId: string;             // 受影响对象 ID（Character.id 或 Combatant.id）

  // --- 上下文 ---
  scope: StatusScope;            // 适用域
  combatId?: string;            // 若为 combat 域，关联的战斗记录 ID

  // --- 生命周期 ---
  isActive: boolean;             // 是否激活
  declaredAt: number;            // 声明开始时间戳
  declaredEndAt?: number;       // 声明结束时间戳（如已结束）
  expiresAt?: number;           // 预计过期时间（由持续时间计算）

  // --- 元数据（运行时） ---
  metadata?: Record<string, any>; // 额外运行时数据
                                  // 如：死亡豁免计数、专注法术 ID 等
}

// ======================
// 五、状态库（StatusLibrary）—— 注册与查询
// ======================

/** 状态库接口 —— 所有状态定义的注册中心 */
export interface StatusLibrary {
  /** 注册一个状态定义 */
  register(definition: StatusDefinition): void;
  /** 根据 ID 获取状态定义 */
  get(id: string): StatusDefinition | undefined;
  /** 列出所有已注册状态 */
  list(): StatusDefinition[];
  /** 根据效果类型反查相关状态 */
  findByEffect(effectType: EffectType): StatusDefinition[];
}

// ======================
// 六、状态管理器（StatusManager）—— 运行时操作
// ======================

/** 状态管理器接口 —— 声明开始/结束/查询 */
export interface StatusManager {
  /** 声明状态开始（检测器通过后） */
  declareStart(
    definitionId: string,
    targetId: string,
    scope: StatusScope,
    combatId?: string
  ): StatusInstance;

  /** 声明状态结束（检测器触发或手动） */
  declareEnd(instanceId: string): StatusInstance | null;

  /** 查询目标的所有激活状态 */
  getActiveStatuses(targetId: string, scope?: StatusScope): StatusInstance[];

  /** 检查目标是否具有特定效果 */
  hasEffect(targetId: string, effectType: EffectType, scope?: StatusScope): boolean;

  /** 获取目标的所有效果列表（用于优劣势判定、动作阻止等） */
  getEffects(targetId: string, scope?: StatusScope): Effect[];

  /** 回合推进：处理持续时间衰减、触发结束检测 */
  advanceRound(combatId: string): void;

  /** 清理过期状态 */
  cleanupExpired(): void;
}

// ======================
// 七、辅助类型
// ======================

/** 状态变更事件 —— 用于订阅/通知 */
export interface StatusChangeEvent {
  type: 'start' | 'end' | 'expire';
  instance: StatusInstance;
  definition: StatusDefinition;
  timestamp: number;
}

/** 状态变更监听器 */
export type StatusChangeListener = (event: StatusChangeEvent) => void;
