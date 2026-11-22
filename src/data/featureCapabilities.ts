/**
 * 主动技能能力路由器（注册式，与 advantageRules / reactionDefinitions 同思想）。
 * 特性名 → 通道映射：战斗内点击主动技能时按通道路由到既有引擎，
 * 未注册的特性回退 manual（弹提示由 DM 手动结算，P1 默认行为）。
 * 键口径与 reactionDefinitions 一致：`feature:<特性名>`。
 */

import type { AdvantageEffectConfig, CheckScene, CheckSceneGroup } from '@/types/combat';
import type { AbilityKey, Character, SpellSlotLevel } from '@/types/character';
import type { Combatant } from '@/types/combat';
import { characterStore } from '@/data/characterStore';
import { SPEC_DB } from '@/data/featureSpecs';
import type { HealSpec, ResourceConvSpec } from '@/data/featureSpecs';

/**
 * FeatureChannel 双来源：
 *  - 代码注册表渠道（checkModifier/advantage/status/reaction/attack_rider/aoe_save）：spec 含推导函数，仅 REGISTRY 可表达
 *  - spec 数据渠道（heal/resource_conv）：纯数据 spec 由仓库 featureSpecs/phb2014.json 提供（决策 1）
 * manual = 未注册兜底。
 */
export type FeatureChannel = 'checkModifier' | 'advantage' | 'status' | 'reaction' | 'attack_rider' | 'aoe_save' | 'heal' | 'resource_conv' | 'container' | 'wildShape' | 'manual';

/** 已实现引擎的渠道集：spec 数据渠道命中此集才可走功能引擎；未命中时消费方按 manual 兜底（P3 已登记 heal/resource_conv） */
const ENGINE_READY_CHANNELS = new Set<string>(['checkModifier', 'advantage', 'status', 'reaction', 'attack_rider', 'aoe_save', 'heal', 'resource_conv', 'container', 'wildShape']);

/** advantage 通道单条 pending 优劣势参数（复用 PendingAdvantageSource 的场景/方向字段） */
export interface FeatureAdvantageSpec {
  mode: 'advantage' | 'disadvantage';
  scene: CheckScene | CheckSceneGroup | 'any';
  /** pending 标记的 reason 文案；缺省用特性名 */
  reason?: string;
}

/**
 * checkModifier 通道参数：写入 PendingCheckModifier（复用次数型检定加值引擎）。
 * 骰面/文案按施用者推导（激励骰随诗人等级 d6→d12），故为函数。
 */
export interface FeatureCheckModifierSpec {
  /** 加值骰参数（激励：1 枚 d6-d12） */
  dice: (caster: Combatant) => { count: number; sides: number; flatBonus?: number };
  /** 骰面标签（面板/记录展示，如 d6/d8/d10/d12）；缺省按 sides 推导 */
  diceLabel?: (caster: Combatant) => string;
  /** 适用场景（'any' 覆盖攻击/法术/豁免/技能检定） */
  scene: CheckScene | CheckSceneGroup | 'any';
  /** pending 标记文案（含施用者名与骰面） */
  reason: (caster: Combatant) => string;
  mode?: 'bonus' | 'penalty';
  /** 有效期（绝对回合，-1 = 整场战斗）；缺省 -1 */
  expireRound?: number;
}

/**
 * aoe_save 通道参数：范围 + 豁免 + 伤害一次性结算（5e 吐息武器语义）。
 * 伤害类型随龙裔血统变化，注册表只给默认值，弹窗提供 6 类切换。
 */
export interface FeatureAoeSaveSpec {
  /** 伤害骰（龙裔 5 级 2d6；16 级 3d6 等成长由 DM 在特性描述/卡面维护） */
  damage: { dice: string; damageType: string };
  /** 豁免属性（吐息武器 = 敏捷） */
  saveAbility: AbilityKey;
  /** DC 推导（吐息武器 = 8 + 熟练 + 体质调整值） */
  dc: (caster: Combatant) => number;
  /** 豁免成功减半；缺省 true */
  halfOnSave?: boolean;
}

export interface FeatureCapability {
  /** 路由通道 */
  channel: FeatureChannel;
  /** 展示用说明（面板 tooltip / 手动结算提示文案） */
  hint?: string;
  /**
   * 容器通道参数（引导神力/暗影技艺类多形态特性）：forms 为子形态完整能力表，
   * 角色卡 chosenForm 预选后战斗层按所选形态能力接管通道路由；
   * 池扣与动作扣始终按容器特性本身（容器为池主）。
   */
  container?: {
    forms: { key: string; label: string; capability: FeatureCapability }[];
    /** 未预选时的拦截文案；缺省通用提示 */
    unchosenHint?: string;
  };
  /**
   * attack_rider 通道契约：近战武器攻击命中后，在伤害结算弹窗勾选追加的资源消耗。
   * 资源消耗与效果落地在命中时刻结算（5e「当你命中时」语义），勾选声明不扣资源。
   */
  attackRider?: AttackRiderSpec;
  /**
   * checkModifier 通道参数：DM/玩家选目标后由通道执行器写入目标身上的
   * PendingCheckModifier（弹窗确认时扣动作与池，取消不扣）。
   */
  checkModifier?: FeatureCheckModifierSpec;
  /**
   * aoe_save 通道参数（吐息武器类范围豁免特性）：范围形状解析自特性描述文本
   * （aoeShapes.parseAoeSpec，「15尺锥状」「30尺线状」），豁免 DC/伤害按施用者推导。
   */
  aoeSave?: FeatureAoeSaveSpec;
  /**
   * status 通道参数：挂载状态库键。状态的实际效果（如优劣势）由通道执行器以
   * instance.metadata.effects 注入；伤害加值等数值效果走 TurnTodo 提醒 DM 手动结算。
   */
  status?: {
    statusKey: string;
    /** 持续回合数（状态实例按绝对回合过期）；缺省 = 手动解除 */
    durationRounds?: number;
    /** TurnTodo 提醒文案；缺省不建待办 */
    todo?: string;
    /** 实例级优劣势效果（随状态实例生效/过期，经 advantageRules condition 检测器生效） */
    effects?: AdvantageEffectConfig[];
  };
  /**
   * advantage 通道参数：写入 PendingAdvantageSource（anchor = 施用者回合过期）。
   * self = 自身检定优势；incoming = 反向条目（针对持有者的检定，写入全部敌方标记）。
   */
  advantage?: {
    self: FeatureAdvantageSpec;
    incoming?: FeatureAdvantageSpec;
  };
  /** heal 渠道 spec（spec 数据层，P3 引擎结算；engineAvailable=false 期间按 manual 兜底） */
  heal?: HealSpec;
  /** resource_conv 渠道 spec（spec 数据层，P3 引擎结算；engineAvailable=false 期间按 manual 兜底） */
  resourceConv?: ResourceConvSpec;
  /**
   * wildShape 通道参数（德鲁伊荒野变形）：无推导参数——野兽代表表
   * （wildShapeBeasts.WILD_SHAPE_BEASTS）由弹窗读取；变身/还原在消费方执行。
   */
  wildShape?: {};
  /** 解析来源：registry = 代码注册表（缺省）；spec_db = 仓库 spec 文件 */
  source?: 'registry' | 'spec_db';
  /** 渠道引擎是否已实现；spec_db 条目 channel 未登记 ENGINE_READY_CHANNELS 时为 false */
  engineAvailable?: boolean;
}

/**
 * attack_rider 资源消耗与效果契约（至圣斩/震慑拳类「命中触发」特性）。
 * damage 骰在弹窗内与武器骰合并输入，重击一起翻倍；伤害类型分组件走抗性结算。
 */
export interface AttackRiderSpec {
  /** 资源消耗：pool = 特性池（气等）；spellSlot = 法术位（环级可升级，每高 1 环 +perSlotDice） */
  cost: { kind: 'pool'; cost: number } | { kind: 'spellSlot' };
  /** 基础追加伤害骰 */
  damage?: { dice: string; damageType: string };
  /** 目标生物类型匹配时追加骰（至圣斩对不死/邪眷） */
  bonusDice?: { dice: string; damageType: string; vs: string[] };
  /** spellSlot 成本按环级升级：每高于基准环 1 级追加一组骰 */
  perSlotDice?: { dice: string; damageType: string };
  /** 命中后豁免 rider（震慑拳）：失败挂状态 + TurnTodo 提醒解除 */
  save?: {
    ability: AbilityKey;
    /** DC 由攻击者角色卡推导（8 + 熟练 + 属性调整值） */
    dc: (attacker: Character) => number;
    /** 失败挂载的状态（statusLibrary definitionId；P6-2 扩战技系：倒地/恐惧/挑衅/缴械） */
    failStatus: 'stunned' | 'prone' | 'frightened' | 'goaded' | 'disarmed';
    /** 状态持续回合数（durationRounds 2 ≈ 至施用者下回合结束） */
    durationRounds: number;
    todo: string;
  };
  /**
   * 豁免失败位移 rider（推撞攻击）：状态型 failStatus 表达不了的纯位移效果。
   * 有沙盘 token 时自动推离攻击者 cells 格（切比雪夫方向、clamp 边界）；无 token 记提示行。
   */
  push?: {
    feet: number;
  };
  /**
   * 延迟引爆 rider（渗透劲类）：命中勾选不结算即时效果，改为在目标身上挂标记状态
   * （metadata.attackerId 记录施劲者）；引爆由 DM 后续主动发起（耗动作），引爆 DC/伤害由
   * detonate 声明。同一时间仅一个目标受影响（挂载前由执行器解除旧标记）。
   */
  embed?: {
    statusId: string;
    detonate: {
      ability: AbilityKey;
      dc: (attacker: Character) => number;
      damageDice: string;
      damageType: string;
    };
  };
  /** 弹窗勾选区与声明摘要文案 */
  hint: string;
}

const registry = new Map<string, FeatureCapability>();

function register(featureName: string, capability: FeatureCapability): void {
  registry.set(`feature:${featureName}`, capability);
}

// P1 注册表：仅已接入的通道；新增通道时在此登记，勿在 UI 组件硬编码分支

// 激励骰面派生：诗人 1-4 级 d6、5-9 d8、10-14 d10、15+ d12（5e 激励特性随等级成长）。
// 非诗人（或 NPC/无角色卡）默认 d6——DM 对魔法物品等来源裁量发放。
function bardicDieSides(caster: Combatant): number {
  const char = caster.characterId ? characterStore.get(caster.characterId) : null;
  const cls = String(char?.profession?.class ?? (char as any)?.class ?? '');
  if (cls.includes('吟游诗人') && char) {
    const lv = typeof char.level === 'number' ? char.level : 1;
    if (lv >= 15) return 12;
    if (lv >= 10) return 10;
    if (lv >= 5) return 8;
  }
  return 6;
}

register('诗人激励', {
  channel: 'checkModifier',
  checkModifier: {
    dice: (caster) => ({ count: 1, sides: bardicDieSides(caster), flatBonus: 0 }),
    diceLabel: (caster) => `d${bardicDieSides(caster)}`,
    scene: 'any',
    reason: (caster) => `${caster.name} 的吟游诗人激励（d${bardicDieSides(caster)}）`,
  },
  hint: '附赠动作发出激励骰：目标下一次能力检定/攻击/豁免可将骰面加到结果上',
});

// 吐息武器（龙裔种族特性）：动作呼出锥状能量，范围内敏捷豁免失败全额伤害、成功减半。
// 伤害类型随龙系血统变化（火/电/毒/寒/酸/钝击），注册表给默认值，结算弹窗可切换。
function casterProfBonus(caster: Combatant): number {
  const char = caster.characterId ? characterStore.get(caster.characterId) : null;
  return typeof char?.proficiencyBonus === 'number' ? char.proficiencyBonus : 2;
}
function casterConMod(caster: Combatant): number {
  const char = caster.characterId ? characterStore.get(caster.characterId) : null;
  return char?.abilities?.constitution?.modifier
    ?? Math.floor((((caster as any).constitution ?? 10) - 10) / 2);
}

register('吐息武器', {
  channel: 'aoe_save',
  aoeSave: {
    damage: { dice: '2d6', damageType: '火焰' },
    saveAbility: 'dexterity',
    dc: (caster) => 8 + casterProfBonus(caster) + casterConMod(caster),
    halfOnSave: true,
  },
  hint: '动作呼出破坏性能量（形状与尺寸见特性描述），范围内目标敏捷豁免失败受全额伤害、成功减半',
});

// P2 注册表：C 类状态切换与优劣势通道
register('狂暴', {
  channel: 'status',
  status: {
    statusKey: 'rage',
    durationRounds: 10,
    effects: [
      { mode: 'advantage', scene: 'check', ability: 'strength', appliesTo: 'self', label: '狂暴' },
      { mode: 'advantage', scene: 'saving_throw', ability: 'strength', appliesTo: 'self', label: '狂暴' },
    ],
    todo: '狂暴持续中：力量检定/力量豁免优势，近战武器伤害加值（+2/+3/+4 按等级），钝击/穿刺/挥砍抗性；回合内未攻击且未受伤则提前结束',
  },
  hint: '附赠动作进入狂暴：力量检定/豁免优势 + 近战伤害加值 + 物理抗性（伤害加值与抗性请手动结算）',
});

register('鲁莽攻击', {
  channel: 'advantage',
  advantage: {
    self: { mode: 'advantage', scene: 'attack_melee', reason: '鲁莽攻击（近战武器攻击优势）' },
    incoming: { mode: 'advantage', scene: 'attack_melee', reason: '目标处于鲁莽攻击（对你的近战攻击优势）' },
  },
  hint: '本回合近战武器攻击优势，代价是下回合开始前敌人的近战攻击对你也有优势',
});

// P3 注册表：attack_rider 命中触发通道（至圣斩/震慑拳）
register('至圣斩', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'spellSlot' },
    damage: { dice: '2d8', damageType: '光耀' },
    bonusDice: { dice: '1d8', damageType: '光耀', vs: ['undead', 'fiend'] },
    perSlotDice: { dice: '1d8', damageType: '光耀' },
    hint: '命中时消耗 1 环法术位：+2d8 光耀（不死/邪眷再 +1d8），每高 1 环再 +1d8',
  },
});

/** 战技豁免 DC：8 + 熟练 + 力敏较高者（PHB2014 战斗大师习得时自选，工具取双高免卡上配置） */
function battleMasterDc(attacker: Character): number {
  const prof = attacker.proficiencyBonus ?? 2 + Math.floor((((attacker.level ?? 1) as number) - 1) / 4);
  const str = attacker.abilities?.strength?.modifier ?? 0;
  const dex = attacker.abilities?.dexterity?.modifier ?? 0;
  return 8 + prof + Math.max(str, dex);
}

// P6-2 注册表：战斗大师战技（卓越骰 1 粒 = 池 cost 1，战技骰 d8 伤害并入武器伤害同类型）。
// 豁免失败效果：摔绊→倒地 / 恐吓→恐惧 / 挑衅→挑衅 / 缴械→缴械；推撞→位移 10 尺（push）。
register('摔绊攻击', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'pool', cost: 1 },
    damage: { dice: '1d8', damageType: '' },
    save: {
      ability: 'dexterity',
      dc: battleMasterDc,
      failStatus: 'prone',
      durationRounds: 2,
      todo: '倒地：起身需半速移动（至下回合）',
    },
    hint: '命中时消耗 1 粒卓越骰：+1d8 伤害，目标敏捷豁免 DC 8+熟练+力敏调，失败倒地',
  },
});

register('恐吓攻击', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'pool', cost: 1 },
    damage: { dice: '1d8', damageType: '' },
    save: {
      ability: 'wisdom',
      dc: battleMasterDc,
      failStatus: 'frightened',
      durationRounds: 2,
      todo: '恐惧解除检查（至施用者下回合结束）',
    },
    hint: '命中时消耗 1 粒卓越骰：+1d8 伤害，目标感知豁免 DC 8+熟练+力敏调，失败恐惧至施用者下回合结束',
  },
});

register('挑衅攻击', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'pool', cost: 1 },
    damage: { dice: '1d8', damageType: '' },
    save: {
      ability: 'wisdom',
      dc: battleMasterDc,
      failStatus: 'goaded',
      durationRounds: 2,
      todo: '挑衅解除检查（至施用者下回合结束）',
    },
    hint: '命中时消耗 1 粒卓越骰：+1d8 伤害，目标感知豁免 DC 8+熟练+力敏调，失败挑衅（对他人攻击劣势）至施用者下回合结束',
  },
});

register('推撞攻击', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'pool', cost: 1 },
    damage: { dice: '1d8', damageType: '' },
    save: {
      ability: 'strength',
      dc: battleMasterDc,
      failStatus: 'prone',
      durationRounds: 2,
      todo: '（推撞：不倒地，仅位移）',
    },
    push: { feet: 10 },
    hint: '命中时消耗 1 粒卓越骰：+1d8 伤害，目标力量豁免 DC 8+熟练+力敏调，失败被推离 10 尺',
  },
});

register('缴械攻击', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'pool', cost: 1 },
    damage: { dice: '1d8', damageType: '' },
    save: {
      ability: 'dexterity',
      dc: battleMasterDc,
      failStatus: 'disarmed',
      durationRounds: 2,
      todo: '缴械：一件手持武器落在脚边（拾取需自由互动/动作）',
    },
    hint: '命中时消耗 1 粒卓越骰：+1d8 伤害，目标敏捷豁免 DC 8+熟练+力敏调，失败缴械一件手持武器',
  },
});

register('震慑拳', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'pool', cost: 1 },
    save: {
      ability: 'constitution',
      dc: (attacker) => {
        // 熟练加值：卡上缺失时按等级推导（L1-4→2，每 4 级 +1）
        const prof = attacker.proficiencyBonus ?? 2 + Math.floor((((attacker.level ?? 1) as number) - 1) / 4);
        return 8 + prof + (attacker.abilities?.wisdom?.modifier ?? 0);
      },
      failStatus: 'stunned',
      durationRounds: 2,
      todo: '震慑解除检查（至施用者下回合结束）',
    },
    hint: '命中时消耗 1 点气：目标体质豁免 DC 8+熟练+感调，失败震慑至施用者下回合结束',
  },
});

// P5 注册表：渗透劲延迟引爆（散打宗 17 级）。埋劲走 attack_rider 命中勾选（3 气在命中时刻扣），
// 引爆为 DM 主动入口：带劲力标记时特性按钮变为引爆弹窗（CON 豁免失败 HP0 / 成功 10d10 暗蚀，耗动作）。
register('渗透劲', {
  channel: 'attack_rider',
  attackRider: {
    cost: { kind: 'pool', cost: 3 },
    embed: {
      statusId: 'quivering_palm',
      detonate: {
        ability: 'constitution',
        dc: (attacker) => {
          const prof = attacker.proficiencyBonus ?? 2 + Math.floor((((attacker.level ?? 1) as number) - 1) / 4);
          return 8 + prof + (attacker.abilities?.wisdom?.modifier ?? 0);
        },
        damageDice: '10d10',
        damageType: '暗蚀',
      },
    },
    hint: '命中时消耗 3 点气：劲力埋入目标体内（同一时间仅一个目标），之后可用动作引爆——目标体质豁免 DC 8+熟练+感调，失败生命归 0、成功受 10d10 暗蚀',
  },
});

function casterChaMod(caster: Combatant): number {
  const char = caster.characterId ? characterStore.get(caster.characterId) : null;
  return char?.abilities?.charisma?.modifier
    ?? Math.floor((((caster as any).charisma ?? 10) - 10) / 2);
}

// P5 注册表：容器预选通道（引导神力/暗影技艺类多形态特性）。
// 角色卡「…」信息对话框四选一固化 chosenForm，战斗层按所选形态能力接管通道路由；
// 池扣与动作扣始终按容器特性本身（卡上容器为池主，子形态不重复扣）。
register('引导神力', {
  channel: 'container',
  container: {
    forms: [
      {
        key: '生命', label: '生命',
        capability: {
          channel: 'heal',
          heal: { type: 'hp', levelFactor: 5, levelAttr: '圣武士等级' },
          hint: '引导神力（生命）：恢复生命等于 5×圣武士等级（可分配给范围内生物，此处简化为自身恢复）',
        },
      },
      {
        key: '毁灭', label: '毁灭',
        capability: {
          channel: 'manual',
          hint: '引导神力（毁灭）：下一次神威打击的伤害骰全部取最大值，请按描述手动结算',
        },
      },
      {
        key: '不灭信念', label: '不灭信念',
        capability: {
          channel: 'reaction',
          hint: '引导神力（不灭信念）：承受伤害时触发，按誓言描述手动结算（反应类，满足条件时自动提示）',
        },
      },
      {
        key: '光辉', label: '光辉',
        capability: {
          channel: 'aoe_save',
          aoeSave: {
            damage: { dice: '2d10', damageType: '光耀' },
            saveAbility: 'dexterity',
            dc: (caster) => 8 + casterProfBonus(caster) + casterChaMod(caster),
            halfOnSave: true,
          },
          hint: '引导神力（光辉）：范围内敏捷豁免失败受 2d10 光耀、成功减半（可见目标）',
        },
      },
    ],
    unchosenHint: '「引导神力」未预选形态，请回角色卡特性「…」信息对话框预选后使用',
  },
});

register('暗影技艺', {
  channel: 'container',
  container: {
    forms: [
      { key: '黑暗术', label: '黑暗术', capability: { channel: 'manual', hint: '暗影技艺（黑暗术）：消耗 2 气，15 尺球形黑暗区域，黑暗内视觉失效，请手动结算' } },
      { key: '黑暗视觉', label: '黑暗视觉', capability: { channel: 'manual', hint: '暗影技艺（黑暗视觉）：消耗 2 气，获得黑暗视觉至下回合结束，请手动结算' } },
      { key: '行动无踪', label: '行动无踪', capability: { channel: 'manual', hint: '暗影技艺（行动无踪）：消耗 2 气，隐身于暗影中（轻步/潜行优势），请手动结算' } },
      { key: '沉默术', label: '沉默术', capability: { channel: 'manual', hint: '暗影技艺（沉默术）：消耗 2 气，10 尺球形静默区域（言语/施法含声成分受阻），请手动结算' } },
    ],
    unchosenHint: '「暗影技艺」未预选形态，请回角色卡特性「…」信息对话框预选后使用',
  },
});

// P5 注册表：荒野变形（德鲁伊 2 级战斗变形）。变身 = 参战者战斗形状按野兽模板整体替换
// （HP/AC/速度/六维/攻击），原形数据快照存参战者 wildShape.snapshot；再次点按特性 =
// 自愿解除还原（HP 保留野兽侧受损语义由 DM 手动校正）；野兽 HP 归 0 自动恢复原形。
// 野兽池扣（2 次/短休）按特性池体系在弹窗确认时扣（poolInfo 透传）。
register('荒野变形', {
  channel: 'wildShape',
  wildShape: {},
  hint: '荒野变形：变身为野兽（图鉴野兽模板，CR 按德鲁伊等级），参战者战斗数据整体替换为野兽数据；再次使用可恢复原形',
});

/**
 * 查特性能力（三级解析，决策 4：技能为核心、调用时导入引擎）：
 *  1. REGISTRY（代码注册表，含推导函数的通道；同名覆盖 spec 文件）
 *  2. SPEC_DB（仓库静态 spec 文件，纯数据通道；engineAvailable 标记渠道引擎是否已实现）
 *  3. manual 兜底（现有行为：池扣自动化 + 手动结算提示）
 */
export function resolveFeatureCapability(featureName: string): FeatureCapability {
  const reg = registry.get(`feature:${featureName}`);
  if (reg) return reg;
  const entry = SPEC_DB[featureName];
  if (entry) {
    return {
      channel: entry.channel,
      ...(entry.channel === 'heal' ? { heal: entry.spec as HealSpec } : {}),
      ...(entry.channel === 'resource_conv' ? { resourceConv: entry.spec as ResourceConvSpec } : {}),
      source: 'spec_db',
      engineAvailable: ENGINE_READY_CHANNELS.has(entry.channel),
    };
  }
  return { channel: 'manual' };
}
