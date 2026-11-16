/**
 * 主动技能能力路由器（注册式，与 advantageRules / reactionDefinitions 同思想）。
 * 特性名 → 通道映射：战斗内点击主动技能时按通道路由到既有引擎，
 * 未注册的特性回退 manual（弹提示由 DM 手动结算，P1 默认行为）。
 * 键口径与 reactionDefinitions 一致：`feature:<特性名>`。
 */

import type { AdvantageEffectConfig, CheckScene, CheckSceneGroup } from '@/types/combat';

export type FeatureChannel = 'checkModifier' | 'advantage' | 'status' | 'reaction' | 'manual';

/** advantage 通道单条 pending 优劣势参数（复用 PendingAdvantageSource 的场景/方向字段） */
export interface FeatureAdvantageSpec {
  mode: 'advantage' | 'disadvantage';
  scene: CheckScene | CheckSceneGroup | 'any';
  /** pending 标记的 reason 文案；缺省用特性名 */
  reason?: string;
}

export interface FeatureCapability {
  /** 路由通道 */
  channel: FeatureChannel;
  /** 展示用说明（面板 tooltip / 手动结算提示文案） */
  hint?: string;
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
}

const registry = new Map<string, FeatureCapability>();

function register(featureName: string, capability: FeatureCapability): void {
  registry.set(`feature:${featureName}`, capability);
}

// P1 注册表：仅已接入的通道；新增通道时在此登记，勿在 UI 组件硬编码分支
register('诗人激励', {
  channel: 'checkModifier',
  hint: '确认后为目标下一次能力检定加骰奖励（走圆桌检定加值引擎）',
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

/** 查特性能力（未注册回退 manual） */
export function resolveFeatureCapability(featureName: string): FeatureCapability {
  return registry.get(`feature:${featureName}`) ?? { channel: 'manual' };
}
