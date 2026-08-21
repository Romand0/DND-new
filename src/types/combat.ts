// src/types/combat.ts

// ===== 新增：体型枚举 =====
/** 体型级别：0=微型, 1=小型, 2=中型, 3=大型, 4=巨型, 5=超巨型 */
export type CreatureSize = 0 | 1 | 2 | 3 | 4 | 5;
export const CREATURE_SIZE_LABELS: Record<CreatureSize, string> = {
  0: '微型', 1: '小型', 2: '中型', 3: '大型', 4: '巨型', 5: '超巨型',
};

// ===== 新增：种类枚举 =====
export type CreatureType =
  | 'aberration' | 'beast' | 'celestial' | 'construct'
  | 'dragon' | 'elemental' | 'fey' | 'fiend'
  | 'giant' | 'humanoid' | 'monstrosity' | 'ooze'
  | 'plant' | 'undead';

export const CREATURE_TYPE_LABELS: Record<CreatureType, string> = {
  aberration: '异怪', beast: '野兽', celestial: '天界生物', construct: '构装生物',
  dragon: '龙类', elemental: '元素生物', fey: '精类', fiend: '邪魔',
  giant: '巨人', humanoid: '类人生物', monstrosity: '怪兽', ooze: '泥怪',
  plant: '植物', undead: '不死生物',
};

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  ac?: number;
  maxHp?: number;
  currentHp?: number;
  tempHp?: number;
  isDead?: boolean;
  /** 昏迷（HP 归零但未死亡）：表格表头黯淡，棋子变灰 */
  isUnconscious?: boolean;
  /** 失能（Incapacitated）：无法执行任何动作或反应，actions 视为 0；模拟模式下同样生效 */
  isIncapacitated?: boolean;
  /** 死亡豁免失败次数（D&D 5e：累计 3 次即死亡） */
  deathSaveFailures?: number;
  /** 死亡豁免成功次数（D&D 5e：累计 3 次即稳定） */
  deathSaveSuccesses?: number;
  isPc?: boolean;
  characterId?: string;
  note?: string;
  speed?: number;
  /** 本回合已移动尺数（D&D 5e：每回合开始归零，移动后累加，达到 speed 后不能再走）；仅放映模式下使用，模拟模式始终视为 0 */
  movementUsed?: number;
  /** 速度调整值（因各种效应对速度的影响，如加速/减速法术）；与疾走无关；每回合开始归零 */
  speedModifier?: number;
  /** 疾走额外移动力（疾走动作获得的额外可用移动力，不累加到速度，只增加可用移动力池）；每回合开始归零 */
  dashExtraMovement?: number;
  /** 六大属性值（仅 NPC 参战者携带，用于计算豁免加值；PC 参战者通过 characterId 引用角色卡获取属性） */
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  /** NPC 实例子 ID，格式 `{templateId}-{random}`，从模板创建时自动带入 */
  childId?: string;
  /** 模板 ID 引用（从模板创建时带入） */
  templateId?: string;
  /** NPC 攻击方式（从模板带入） */
  attacks?: NpcAttack[];
  /** 当前可用动作数（放映模式每回合恢复，模拟模式无限） */
  actions?: number;
  /** 体型级别（0=微型…5=超巨型），仅 NPC 使用 */
  creatureSize?: CreatureSize;
  /** 种类（D&D 5e 生物类型），仅 NPC 使用 */
  creatureType?: CreatureType;
  /** 当前可用附赠动作数（放映模式每回合恢复为 1，模拟模式无限） */
  bonusActions?: number;
  /** 待消费的优劣势标记列表（发起者赋予此参战者的一次性优劣势来源，如协助/法术效果） */
  pendingAdvantageSources?: PendingAdvantageSource[];
  /** 言语能力：能否说话或发出声音（true=可以，false=不可以）。默认真，某些状态可剥夺 */
  canSpeak?: boolean;
}

export interface NpcTemplate {
  id: string;
  /** 用户自定义的模板唯一标识（如 "goblin"），用于识别同类 NPC */
  templateId: string;
  /** 模板显示名称（如 "哥布林"） */
  name: string;
  /** 挑战等级 */
  cr?: string;
  /** 种族 */
  race?: string;
  /** 职业 */
  class?: string;
  /** 描述 */
  description?: string;
  /** 体型 */
  size?: string;
  /** 种类 */
  type?: string;
  /** 阵营 */
  alignment?: string;
  /** 特殊能力 */
  features?: string;
  /** 感知能力 */
  senses?: string;
  /** 语言 */
  languages?: string;
  /** 来源 */
  source?: string;
  /** 属性值 */
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  /** 生命值 */
  maxHp: number;
  /** 速度 */
  speed: number;
  /** 护甲等级 */
  ac: number;
  /** 攻击列表 */
  attacks: NpcAttack[];
  /** 体型（枚举） */
  creatureSize?: CreatureSize;
  /** 种类（枚举） */
  creatureType?: CreatureType;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

export interface NpcAttack {
  name: string;
  attackBonus: string;
  damage: string;
  damageType: string;
  range: string;
  properties: string[];
  subtype?: string;
  normalRange?: number;
  maxRange?: number;
  /** 双手拿持状态下的伤害骰（"多用"属性） */
  twoHandedDamage?: string;
  /** 武器是否已装填（"装填"属性：当前弹匣状态，true=已装填可射击，false=需装填） */
  loaded?: boolean;
}

export interface RoundAction {
  [combatantId: string]: string;
}

/**
 * 回合快照：拍"该回合刚开始"时的完整战斗状态，用于回溯。
 * - initial 快照：切到放映模式时拍一次，保存在 key `${sessionId}:__initial__`
 * - turn 快照：每次进入新回合（startPlayback + advanceTurn）时按回合拍，key `${sessionId}:${round}:${combatantId}`
 *   （只在第一次拍，保留"回到该回合起始点"的不变形）
 */
export interface TurnSnapshot {
  combatants: Combatant[];
  rounds: RoundAction[];
  battleground: any[];
  equipmentChanges?: Record<string, EquipmentChanges>;
}

/**
 * 动作类型：攻击/施法 已实现（消耗动作）；
 * 疾走/撤离/回避/协助/躲藏/预备/搜索 为预留接口（尚无对应机制，仅留占位）。
 */
export type CombatActionType =
  | 'attack'
  | 'cast'
  | 'dash'
  | 'disengage'
  | 'dodge'
  | 'help'
  | 'hide'
  | 'ready'
  | 'search';

/** 动作类型显示标签 */
export const ACTION_LABELS: Record<CombatActionType, string> = {
  attack: '攻击',
  cast: '施法',
  dash: '疾走',
  disengage: '撤离',
  dodge: '回避',
  help: '协助',
  hide: '躲藏',
  ready: '预备',
  search: '搜索',
};

/** 全部动作类型（用于操作面板展示 / 预留接口枚举） */
export const ALL_ACTIONS: CombatActionType[] = [
  'attack',
  'cast',
  'dash',
  'disengage',
  'dodge',
  'help',
  'hide',
  'ready',
  'search',
];

/**
 * 施法时间是否为「1 动作」。
 * castingTime 是自由文本（如 "1 动作" / "1个动作" / "1 个动作"），
 * 附赠动作 / 反应 不计入「1 动作」。
 */
export function isOneActionCast(castingTime?: string): boolean {
  if (!castingTime) return false;
  if (castingTime.includes('附赠') || castingTime.includes('反应')) return false;
  return castingTime.includes('动作');
}

/**
 * 施法时间是否为「1 附赠动作」。
 * castingTime 自由文本中含"附赠"即判定。
 */
export function isBonusActionCast(castingTime?: string): boolean {
  if (!castingTime) return false;
  return castingTime.includes('附赠');
}

// ============ 附赠动作连带触发关系 ============
// D&D 5e 中，有些动作/法术完成后会「无缝衔接」一个附赠动作触发。
// 例如：武僧「疾风连击」——攻击动作完成后自动附带一次无武技的徒手打击（附赠动作）。
// 另一些触发器的效果是使一个原本需要用动作来实现的效果转而用附赠动作来实现。
// 例如：某些专长允许「以附赠动作施展原本需要 1 动作的法术」。
// 这里定义类型接口，供后续特性/专长/法术注册使用。

/**
 * 连带触发类型：
 * - chain: 动作完成后无缝衔接一个附赠动作效果（被动触发）
 * - convert: 将原本需要动作的效果转为附赠动作实现（主动转换）
 */
export type BonusActionTriggerType = 'chain' | 'convert';

/**
 * 附赠动作连带触发定义
 * 描述「什么动作完成后 → 触发什么附赠动作效果」或「什么动作可以转为附赠动作施展」
 */
export interface BonusActionTrigger {
  /** 唯一标识 */
  id: string;
  /** 触发类型：chain=连带衔接 / convert=动作转附赠 */
  type: BonusActionTriggerType;
  /** 触发条件：描述什么动作/法术/特性完成后触发（如 attack / spell:healing_word / feature:flurry_of_blows） */
  sourceAction: string;
  /** 触发后的附赠动作效果描述（如 "unarmed_strike" / "cast_spell:bonus" / "dash"） */
  triggeredBonusAction: string;
  /** 可读的效果名称（UI 展示用） */
  label?: string;
  /** 是否每回合只能触发一次（默认 true，符合 D&D 5e 大多数连带触发） */
  oncePerRound?: boolean;
  /** 前置条件描述（如 "仅限武僧" / "需消耗 1 气点"），用于 UI 提示 */
  prerequisite?: string;
}

/**
 * 动作→附赠动作转换规则
 * 某些特性允许将特定动作转为附赠动作施展（如「敏捷施法者」专长允许以附赠动作施法）
 */
export interface ActionToBonusConversion {
  /** 唯一标识 */
  id: string;
  /** 被转换的动作标识（如 spell:xxx / action:dash） */
  sourceActionId: string;
  /** 转换后的描述（如 "以附赠动作施展" / "以附赠动作冲刺"） */
  convertedLabel: string;
  /** 前置条件（如 "需有 XX 特性" / "本回合未施放附赠动作法术"） */
  prerequisite?: string;
}

/** 预设任务类型：决定点击跳转的弹窗种类；null = 其他（无跳转） */
export type TurnTodoType =
  | 'save_throw'
  | 'damage_roll'
  | 'condition_check'
  | 'concentration_check'
  | 'death_save';

/** 任务类型标签映射 */
export const TURN_TODO_TYPE_LABELS: Record<TurnTodoType, string> = {
  save_throw: '豁免检定',
  damage_roll: '持续伤害',
  condition_check: '状态检查',
  concentration_check: '专注检定',
  death_save: '死亡豁免',
};

/** 回合待办事项 */
export interface TurnTodo {
  id: string;
  combatantId: string;
  name: string;
  type: TurnTodoType | null;
  startRound: number;
  endRound: number; // -1 = 无限期
  executed: boolean;
}

export interface CombatRecord {
  id: string;
  title: string;
  combatants: Combatant[];
  rounds: RoundAction[];
  /** 战斗模式：'simulation' 模拟模式（无回合），'playback' 放映模式（有回合） */
  mode?: 'simulation' | 'playback';
  /** 回合待办列表（放映模式专用） */
  turnTodos?: TurnTodo[];
  /**
   * 装备变更信息（战斗期间的"漏斗"，不直接修改角色卡）
   * key 为 combatantId
   */
   equipmentChanges?: Record<string, EquipmentChanges>;
   /**
     * 装填武器状态：key 为 "{combatantId}:{attackId}" 或 "{combatantId}:{attackName}", value=true 已装填
     */
    loadedWeapons?: Record<string, boolean>;
    /**
     * 放映模式：本回合已用过装填武器攻击的参战者（key=combatantId）。
     * 装填武器每回合只能攻击一次，优先级高于额外动作机制。
     * 新回合由 resetTurnTodosForRound 清空。
     */
    loadingAttackedThisRound?: Record<string, boolean>;
    /** 放映状态持久化：刷新后自动恢复到当前回合并暂停 */
    playbackState?: {
      started: boolean;
      paused: boolean;
      currentTurn: { round: number; combatantId: string } | null;
    };
    createdAt: number;
    updatedAt: number;
}

/**
 * 单个参战者的装备变更信息（"漏斗"）
 * 规则：以子ID (childId) 作为唯一主键
 * - 角色背包 = 信息源（character.equipment）
 * - 变更信息 = 战斗期间 +/- 记录
 * - 战斗背包 = 角色背包 + 应用变更 + 自动合并同名数量
 */
export interface EquipmentChanges {
  /** 战斗中新增物品（例如：拾取）。childId 用于唯一区分，按 childId 去重，自动整理时按名称合并数量 */
  added: Array<{
    childId: string;
    equipment: Record<string, unknown>; // Equipment 序列化快照
  }>;
  /** 战斗中失去物品（例如：投掷/消耗）的 childId 列表 */
  removedChildIds: string[];
  /** 战斗中数量变化：childId -> 数量 delta（正数=增加，负数=减少） */
  quantityDeltas: Record<string, number>;
}

/** 已废除的旧结构（保留兼容读取，不再使用） */
/** @deprecated 请使用 equipmentChanges + 派生战斗背包 */
export interface CombatInventoryItem {
  id: string;
  name: string;
  category: string;
  subtype?: string;
  quantity: number;
  equipmentData: Record<string, unknown>;
  obtainedAt: number;
  source?: string;
}

// =======================
// 优劣势接口类型（advantageRules 引擎用）
// =======================

/** 检定场景类型 —— 引擎据此选择适用的检测器 */
export type CheckScene =
  | 'attack_melee'      // 近战攻击检定
  | 'attack_ranged'     // 远程攻击检定（含投掷远程模式）
  | 'attack_thrown'     // 投掷武器投掷模式（介于近战远程之间）
  | 'spell_attack'      // 法术攻击检定（法术命中判定）
  | 'saving_throw'      // 豁免检定（目标方）
  | 'ability_check'     // 属性检定（D&D 5e：纯能力检定，不含技能）
  | 'skill_check'       // 技能检定（含技能熟练加值的能力检定子集）
  | 'damage';           // 伤害结算（仅展示用，不参与检定判定）

/** 场景通配组 —— PendingAdvantageSource.scene 可用，引擎内按 sceneMatches 前缀匹配 */
export type CheckSceneGroup =
  | 'attack'      // 通配所有攻击检定：attack_melee / attack_ranged / attack_thrown / spell_attack
  | 'check';      // 通配属性+技能检定：ability_check / skill_check

/** 优劣势来源类型标签（用于 UI 颜色区分 + 日志分类） */
export type AdvantageSourceKind =
  | 'equipment'    // 装备相关（不熟练护甲、stealthDisadvantage）
  | 'positional'   // 位置相关（5 尺远程、射程段）
  | 'pending'      // 待消费标记（协助动作、法术效果等一次性来源）
  | 'action'       // 动作相关（dodge/hide 等，本次仅预留）
  | 'condition'    // 状态相关（中毒/束缚等，本次仅预留）
  | 'manual';      // DM 手动覆盖

/** 优劣势原因条目 */
export interface AdvantageReason {
  /** 来源类型 */
  kind: AdvantageSourceKind;
  /** 具体来源描述（如"不熟练的护甲"、"协助（来自 队友A）"） */
  label: string;
  /** 关联的 pendingSourceId（如来自待消费标记） */
  pendingSourceId?: string;
}

/** 优劣势检测结果 */
export interface AdvantageResult {
  advantage: AdvantageReason[];
  disadvantage: AdvantageReason[];
}

/** 手动模式 */
export type ManualMode = 'none' | 'advantage' | 'disadvantage';

/** 待消费的优劣势标记（发起者赋予他人的一次性优劣势来源） */
export interface PendingAdvantageSource {
  /** 唯一实例 ID（crypto.randomUUID()） */
  id: string;
  /** 施加者 combatantId（可为空，表示环境/法术效果） */
  fromId?: string;
  /** 施加者名称（用于 UI 展示，避免 fromId 失效后丢失信息） */
  fromName?: string;
  /** 适用场景：'any' = 所有检定场景；'attack'/'check' = 通配组；或指定具体 scene */
  scene: CheckScene | CheckSceneGroup | 'any';
  /** 优势或劣势 */
  mode: 'advantage' | 'disadvantage';
  /** 原因说明（如"协助"、"祝福术"、"妖火"） */
  reason: string;
  /** 来源分类（用于 AdvantageReason.kind 映射） */
  kind: AdvantageSourceKind;
  /** 目标限制：仅对特定目标生效（如协助动作指定攻击 C 时）；不限制则对所有目标生效 */
  targetId?: string;
  /** 是否仅在 ctx.target 与 fromId 指定的施加者距离 ≤ 1 格（5 尺切比雪夫）时生效；
   *  例如协助动作的「攻击检定仅攻击对象在发出者 5 尺内」。无 fromId / 无 targetPos 时不命中 */
  requireTargetNearFromId?: boolean;
  /** 以「另一参战者回合开始」作为过期锚点，优先级高于 expireRound（两者任一即过期）。
   *  例如协助动作「发出者的下一个回合前过期」= expireOnCombatantId = fromId */
  expireOnCombatantId?: string;
  /** 是否已消费（检定确认后置 true） */
  consumed: boolean;
  /** 创建回合（用于过期判定） */
  createdRound: number;
  /** 过期回合（含）；-1 = 永久直到消费（与 expireOnCombatantId 任一命中即过期） */
  expireRound: number;
}
