// src/types/combat.ts
import type { CastStepLog } from './castStep';
import type { AbilityKey } from './character';
import type { DamageAffinitySet } from './damage';

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

// 种子 / 解析器存 "1/8""1/4""1/2"；编辑器 number input 可能写出 "0.25"。筛选与排序一律先归一。
export const CR_FILTER_VALUES = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
] as const;

const CR_DECIMAL_TO_FRACTION: Record<string, string> = {
  '0.125': '1/8',
  '0.25': '1/4',
  '0.5': '1/2',
};

/** 任意 CR 表示 → 规范字符串（"1/4" / "2"）；无法解析返回 null */
export function normalizeCr(raw: string | number | undefined | null): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim().replace(/⁄/g, '/');
  if (s === '—' || s === '无') return null;
  if (CR_DECIMAL_TO_FRACTION[s]) return CR_DECIMAL_TO_FRACTION[s];
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const v = Number(frac[1]) / Number(frac[2]);
    if (Math.abs(v - 0.125) < 1e-9) return '1/8';
    if (Math.abs(v - 0.25) < 1e-9) return '1/4';
    if (Math.abs(v - 0.5) < 1e-9) return '1/2';
    return s.replace(/\s+/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n - 0.125) < 1e-9) return '1/8';
  if (Math.abs(n - 0.25) < 1e-9) return '1/4';
  if (Math.abs(n - 0.5) < 1e-9) return '1/2';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

/** 规范 CR → 数值，供排序；未知排最后 */
export function crToNumber(raw: string | number | undefined | null): number {
  const canon = normalizeCr(raw);
  if (canon === null) return Number.POSITIVE_INFINITY;
  const frac = canon.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(canon);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

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
  /**
   * 专注状态（D&D 5e）：施展专注类法术成功后自动声明开始。
   * 通行证语义——专注类法术维持的前提；可主动停止、可被伤害豁免失败打断、
   * 失能/昏迷/死亡时禁用（cleanupBrokenConcentration）。战斗临时状态，随 CombatRecord 保留。
   * statusIds：本次施法通过流程附加的状态实例 ID（如防护能量的抗性），
   * 专注结束时由 combatStore.removeConcentrationStatuses 统一联动移除。
   */
  concentration?: { spellName: string; startedRound: number; statusIds?: string[] };
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
  /** NPC 熟练加值（从怪物图鉴模板带入；豁免 = 属性调整值 + 熟练属性 × PB） */
  proficiencyBonus?: number;
  /** NPC 熟练豁免属性（从怪物图鉴模板带入，缺省视为无熟练 → 豁免 = 纯调整值） */
  proficientSaves?: AbilityKey[];
  /** NPC 实例子 ID，格式 `{templateId}-{random}`，从模板创建时自动带入 */
  childId?: string;
  /** 模板 ID 引用（从模板创建时带入） */
  templateId?: string;
  /** 伤害抗性/易伤/免疫快照（从模板创建时解析并固化，旧记录可按 templateId 回退） */
  damageAffinities?: DamageAffinitySet;
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
  /** 手势能力：能否执行 S（手势）成分（true=可以，false=不可以）。默认 true。以下情况置 false：
   * - isIncapacitated（失能）
   * - 导致失能的状态：擒抱、麻痹、石化、震慑、昏迷
   * - DM 手动覆盖 */
  canGesticulate?: boolean;
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
  // ---- 怪物图鉴 2014 自动入库扩展（全部可选，向后兼容）----
  /** 熟练加值（MM2014 不印，缺失时由解析器按 CR 推导） */
  proficiencyBonus?: number;
  /** PB 是否为推导值（源卡未印） */
  pbDerived?: boolean;
  /** 熟练豁免属性列表（如 saving_throw 流程节点消费） */
  savingThrows?: AbilityKey[];
  /** 技能熟练（名称 + 数据卡标注加值） */
  skills?: { name: string; bonus: number }[];
  /** 生命骰表达式（如 "11d8+44"） */
  hpDice?: string;
  /** 护甲描述（如 "链甲"、"天生护甲"；双形态卡为原文全文） */
  acNote?: string;
  /** 英文名（templateId slug 依据） */
  nameEn?: string;
  /** 经验值 */
  xp?: number;
  /** 伤害抗性（中文标签） */
  damageResistances?: string[];
  /** 伤害免疫 */
  damageImmunities?: string[];
  /** 伤害易伤 */
  damageVulnerabilities?: string[];
  /** 状态免疫 */
  conditionImmunities?: string[];
  /** 附加速度说明（如 "飞行 90 尺"） */
  speedNotes?: string;
  /** 结构化特性条目（数据卡「特性」区，如 好斗/灵活） */
  traits?: { name: string; text: string }[];
  /** 解析来源目录（去重消歧用） */
  sourceDir?: string;
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
  /** 双手/多用伤害之外的附加文本（如 "外加1d8"、豁免型攻击的命中效果） */
  note?: string;
  /** 攻击是否视为魔法 */
  magical?: boolean;
  /** 武器是否镀银 */
  silvered?: boolean;
  /** 武器是否精金 */
  adamantine?: boolean;
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
  | 'death_save'
  | 'concentration_save'
  | 'concentration_maintain';

/** 任务类型标签映射 */
export const TURN_TODO_TYPE_LABELS: Record<TurnTodoType, string> = {
  save_throw: '豁免检定',
  damage_roll: '持续伤害',
  condition_check: '状态检查',
  concentration_check: '专注检定',
  death_save: '死亡豁免',
  concentration_save: '专注豁免',
  concentration_maintain: '专注维持',
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
  /**
   * 类型专属附加数据。'concentration_save' 携带 DC、维持的法术与本次伤害来源，
   * 豁免结算（applyConcentrationSaveResult）从这里读 DC；其他类型可不带。
   */
  payload?: {
    dc?: number;
    spellName?: string;
    ability?: string;
    /** 本次承受的最终伤害量（抗性后、临时 HP 吸收前） */
    damage?: number;
    sourceId?: string;
    sourceName?: string;
    sourceKind?: string;
    damageType?: string;
  };
}

export interface CombatRecord {
  id: string;
  title: string;
  combatants: Combatant[];
  rounds: RoundAction[];
  /** 战斗模式：'simulation' 模拟模式（无回合），'playback' 放映模式（有回合） */
  mode?: 'simulation' | 'playback';
  /** 试验场标记：沙盒测试会话（入口一键进入、人偶快速生成、全库调用、仪表盘） */
  isProvingGround?: boolean;
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
    /** 施法步骤日志（按 castId 分组的扁平追加数组，副作用延迟原则下仅在收尾时批量写入） */
    castLogs?: CastStepLog[];
    /** 模拟模式操作日志（无回合概念，按时间顺序记录参战者操作；放映模式写 rounds 不写此字段） */
    operationLog?: OperationLogEntry[];
    createdAt: number;
    updatedAt: number;
}

/** 模拟模式操作日志条目 */
export interface OperationLogEntry {
    id: string;
    /** 记录时间戳（真实时间） */
    timestamp: number;
    /** 操作主体 combatantId（全局操作可缺省） */
    combatantId?: string;
    /** 操作类别：用于日志面板图标/配色 */
    kind: 'attack' | 'damage' | 'heal' | 'spell' | 'status' | 'move' | 'loot' | 'record';
    /** 操作描述文本 */
    text: string;
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
