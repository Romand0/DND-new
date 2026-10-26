// src/data/checkModifierRules.ts
// 注册式检定奖惩引擎：纯函数模块，无 React / store 依赖。
//
// 与 advantageRules（优劣势）互补而非替代：
//   优劣势决定「掷几个 d20、取哪个」，奖惩在最终 d20 上「加减骰子结果」，
//   两者可以同时生效（优势 + 祝福术 = 2d20 取高后再 +1d4）。
//
// 载体双轨（见 types/combat.ts）：
//   状态型：statusManager 实例的 Effect(type='check_modifier').config 携带参数，
//           生命周期（回合过期 / 专注联动 / 手动解除）完全交给状态系统
//   次数型：Combatant.pendingCheckModifiers，每消耗一次 -1，归零移除
//
// 强制语义：惩罚恒强制（引擎兜底，忽略 forced=false）；奖励可选时由 UI 开关决定。
import type {
  CheckScene,
  CheckSceneGroup,
  CheckModifierResult,
  CheckModifierHit,
  CheckModifierDice,
  CheckModifierEffectConfig,
  PendingCheckModifier,
  Combatant,
} from '@/types/combat';
import { sceneMatches } from './advantageRules';
import { globalStatusManager } from './statusManager';
import type { Effect } from '@/types/status';

// =======================
// 上下文
// =======================

export interface CheckModifierContext {
  /** 检定场景（属性检定 / 技能检定 / 三类攻击 / 法术攻击 / 豁免） */
  scene: CheckScene;
  /** 本次检定的主体（奖惩挂在此参战者身上） */
  combatant?: Combatant | null;
  /** 当前回合（次数型 expireRound 判定用） */
  currentRound?: number;
  /** 战斗记录 ID（状态型奖惩查 active 实例时的 combatId） */
  recordId?: string;
  /** 回合上下文（状态型过期判定；放映模式由 getCombatRoundCtx 提供） */
  roundCtx?: { currentRound?: number; turnCombatantId?: string; turnRound?: number };
  /** 玩家已勾选启用的可选奖惩 sourceKey 集合；缺省时可选型一律 enabled=false */
  enabledSourceKeys?: Set<string>;
}

// =======================
// 骰子规格工具
// =======================

/** 骰子规格是否有效（有骰或至少有固定值） */
export function isValidDice(dice: CheckModifierDice | undefined | null): boolean {
  if (!dice) return false;
  const hasDice = Number(dice.count) > 0 && Number(dice.sides) > 0;
  const hasFlat = Math.abs(Number(dice.flatBonus ?? 0)) > 0;
  return hasDice || hasFlat;
}

/** 骰子规格的可读表达式（如 "1d4"、"1d4+1"、"2"） */
export function formatDice(dice: CheckModifierDice | undefined | null): string {
  if (!dice) return '0';
  const count = Math.max(0, Math.floor(Number(dice.count) || 0));
  const sides = Math.max(0, Math.floor(Number(dice.sides) || 0));
  const flat = Number(dice.flatBonus ?? 0);
  const parts: string[] = [];
  if (count > 0 && sides > 0) parts.push(`${count}d${sides}`);
  if (flat !== 0 || parts.length === 0) parts.push(`${flat >= 0 && parts.length > 0 ? '+' : ''}${flat}`);
  return parts.join('');
}

/**
 * 理论上限（用于 UI 预览「最多 +4」）。骰子取满值 + 固定加值。
 * 惩罚返回负数。
 */
export function diceMaxValue(dice: CheckModifierDice | undefined | null, mode: 'bonus' | 'penalty'): number {
  if (!dice) return 0;
  const count = Math.max(0, Math.floor(Number(dice.count) || 0));
  const sides = Math.max(0, Math.floor(Number(dice.sides) || 0));
  const flat = Number(dice.flatBonus ?? 0);
  const raw = count * sides + flat;
  return mode === 'penalty' ? -raw : raw;
}

/**
 * 计算一次奖惩的实际数值：掷骰（由调用方传入已掷结果，缺省时用均值近似预览）。
 * 纯函数——不触发随机，随机由调用方经 diceService 执行后传入 values。
 */
export function resolveModifierValue(
  hit: Pick<CheckModifierHit, 'dice' | 'mode'>,
  rolledValues?: number[],
): number {
  const count = Math.max(0, Math.floor(Number(hit.dice.count) || 0));
  const sides = Math.max(0, Math.floor(Number(hit.dice.sides) || 0));
  const flat = Number(hit.dice.flatBonus ?? 0);
  let sum = flat;
  if (count > 0 && sides > 0) {
    if (Array.isArray(rolledValues) && rolledValues.length === count) {
      sum += rolledValues.reduce((a, b) => a + b, 0);
    } else {
      // 未提供骰值：取每骰期望值（仅用于预览，不用于结算）
      sum += count * ((sides + 1) / 2);
    }
  }
  return hit.mode === 'penalty' ? -sum : sum;
}

// =======================
// 检测器
// =======================

/** 状态型奖惩：扫描 statusManager 中的 check_modifier 效果 */
function detectStatusModifiers(ctx: CheckModifierContext): CheckModifierHit[] {
  const target = ctx.combatant;
  if (!target) return [];
  const effects: Effect[] = globalStatusManager.getEffects(target.id, undefined, ctx.roundCtx);
  const hits: CheckModifierHit[] = [];
  // 状态型实例 ID 需要与 effect 配对；getEffects 只返回效果列表，
  // 因此另取 active 实例按 instanceId 映射（同一实例可能含多个效果）。
  const instances = globalStatusManager.getActiveStatuses(target.id, undefined, ctx.roundCtx);
  const configByInstance = new Map<string, CheckModifierEffectConfig>();
  for (const instance of instances) {
    const instanceEffects = instance.metadata?.effects;
    if (!Array.isArray(instanceEffects)) continue;
    for (const eff of instanceEffects as Effect[]) {
      if (eff?.type !== 'check_modifier') continue;
      const cfg = eff.config as CheckModifierEffectConfig | undefined;
      if (cfg && isValidDice(cfg.dice)) configByInstance.set(instance.instanceId, cfg);
    }
  }
  // 状态定义自带效果（静态注册的奖惩状态）：无实例参数，用默认 1d4
  const defLevelHits: Effect[] = effects.filter(e => e.type === 'check_modifier');
  const coveredByInstance = defLevelHits.length > 0 && configByInstance.size > 0;

  for (const [instanceId, cfg] of configByInstance) {
    if (!sceneMatches(cfg.scene, ctx.scene)) continue;
    hits.push({
      sourceKey: `status:${instanceId}`,
      carrier: 'status',
      instanceId,
      label: cfg.label || '检定奖惩',
      mode: cfg.mode,
      dice: cfg.dice,
      // 惩罚恒强制
      forced: cfg.mode === 'penalty' ? true : cfg.forced === true,
      enabled: cfg.mode === 'penalty' ? true : cfg.forced === true
        ? true
        : (ctx.enabledSourceKeys?.has(`status:${instanceId}`) ?? false),
      fromName: cfg.fromName,
    });
  }

  // 静态状态定义（状态库 effects 直接声明 check_modifier）——当前库内无此类定义，
  // 保留通道以便未来 DM 自定义状态直接携带奖惩。
  if (!coveredByInstance) {
    defLevelHits.forEach((eff, idx) => {
      const cfg = eff.config as CheckModifierEffectConfig | undefined;
      if (!cfg || !isValidDice(cfg.dice)) return;
      if (!sceneMatches(cfg.scene, ctx.scene)) return;
      const key = `status-def:${eff.id}:${idx}`;
      hits.push({
        sourceKey: key,
        carrier: 'status',
        label: cfg.label || eff.description || '检定奖惩',
        mode: cfg.mode,
        dice: cfg.dice,
        forced: cfg.mode === 'penalty' ? true : cfg.forced === true,
        enabled: cfg.mode === 'penalty' ? true : cfg.forced === true
          ? true
          : (ctx.enabledSourceKeys?.has(key) ?? false),
        fromName: cfg.fromName,
      });
    });
  }

  return hits;
}

/** 次数型奖惩：扫描 Combatant.pendingCheckModifiers */
function detectPendingModifiers(ctx: CheckModifierContext): CheckModifierHit[] {
  const target = ctx.combatant;
  if (!target) return [];
  const list: PendingCheckModifier[] = target.pendingCheckModifiers || [];
  const hits: CheckModifierHit[] = [];
  for (const item of list) {
    if (item.consumed) continue;
    if (item.remainingUses <= 0) continue;
    if (item.expireRound !== -1 && ctx.currentRound !== undefined && ctx.currentRound > item.expireRound) continue;
    if (!sceneMatches(item.scene, ctx.scene)) continue;
    if (!isValidDice(item.dice)) continue;
    const key = `pending:${item.id}`;
    const forced = item.mode === 'penalty' ? true : item.forced === true;
    hits.push({
      sourceKey: key,
      carrier: 'pending',
      pendingId: item.id,
      label: item.reason,
      mode: item.mode,
      dice: item.dice,
      forced,
      enabled: forced ? true : (ctx.enabledSourceKeys?.has(key) ?? false),
      remainingUses: item.remainingUses,
      fromName: item.fromName,
    });
  }
  return hits;
}

// =======================
// 核心入口
// =======================

/**
 * 检测一次检定上的全部奖惩。
 * 纯只读：不修改状态实例、不消费次数（消费由调用方在确认后执行）。
 */
export function detectCheckModifiers(ctx: CheckModifierContext): CheckModifierResult {
  const hits = [...detectStatusModifiers(ctx), ...detectPendingModifiers(ctx)];
  // 排序：强制在前（玩家不能忽略），同组保持检测顺序
  hits.sort((a, b) => (a.forced === b.forced ? 0 : a.forced ? -1 : 1));
  return {
    hits,
    hasForced: hits.some(h => h.forced),
    hasOptional: hits.some(h => !h.forced),
  };
}

/**
 * 计算本次检定实际生效的奖惩合力（仅统计 enabled=true 的条目）。
 * rolledByKey：按 sourceKey 提供已掷骰值；缺省时用期望值（预览）。
 */
export function computeModifierTotal(
  result: CheckModifierResult,
  rolledByKey?: Record<string, number[]>,
): { total: number; applied: Array<{ hit: CheckModifierHit; value: number }> } {
  const applied: Array<{ hit: CheckModifierHit; value: number }> = [];
  let total = 0;
  for (const hit of result.hits) {
    if (!hit.enabled) continue;
    const value = resolveModifierValue(hit, rolledByKey?.[hit.sourceKey]);
    total += value;
    applied.push({ hit, value });
  }
  return { total, applied };
}

/** 需要掷骰的奖惩条目（用于 UI 一次性生成投骰输入框） */
export function collectDiceRequests(result: CheckModifierResult): Array<{ sourceKey: string; count: number; sides: number; label: string }> {
  const out: Array<{ sourceKey: string; count: number; sides: number; label: string }> = [];
  for (const hit of result.hits) {
    if (!hit.enabled) continue;
    const count = Math.max(0, Math.floor(Number(hit.dice.count) || 0));
    const sides = Math.max(0, Math.floor(Number(hit.dice.sides) || 0));
    if (count > 0 && sides > 0) out.push({ sourceKey: hit.sourceKey, count, sides, label: hit.label });
  }
  return out;
}

// =======================
// 消费（结算后由调用方执行）
// =======================

/** 提取本次实际计入的条目（供调用方消费） */
export function getAppliedModifierRefs(result: CheckModifierResult): {
  pendingIds: string[];
  statusInstanceIds: string[];
} {
  const pendingIds: string[] = [];
  const statusInstanceIds: string[] = [];
  for (const hit of result.hits) {
    if (!hit.enabled) continue;
    if (hit.carrier === 'pending' && hit.pendingId) pendingIds.push(hit.pendingId);
    // 状态型不消费实例（状态按自身持续时间过期），但次数型状态（未来扩展）可在此扩展
    if (hit.carrier === 'status' && hit.instanceId) statusInstanceIds.push(hit.instanceId);
  }
  return { pendingIds, statusInstanceIds };
}

// =======================
// 场景辅助（外部构造 context 时复用）
// =======================

export type { CheckScene, CheckSceneGroup };
