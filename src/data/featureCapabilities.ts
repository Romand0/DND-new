/**
 * 主动技能能力路由器（注册式，与 advantageRules / reactionDefinitions 同思想）。
 * 特性名 → 通道映射：战斗内点击主动技能时按通道路由到既有引擎，
 * 未注册的特性回退 manual（弹提示由 DM 手动结算，P1 默认行为）。
 * 键口径与 reactionDefinitions 一致：`feature:<特性名>`。
 */

export type FeatureChannel = 'checkModifier' | 'advantage' | 'status' | 'reaction' | 'manual';

export interface FeatureCapability {
  /** 路由通道 */
  channel: FeatureChannel;
  /** 展示用说明（面板 tooltip / 手动结算提示文案） */
  hint?: string;
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

/** 查特性能力（未注册回退 manual） */
export function resolveFeatureCapability(featureName: string): FeatureCapability {
  return registry.get(`feature:${featureName}`) ?? { channel: 'manual' };
}
