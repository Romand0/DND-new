// 躲藏对抗与 per-observer 可见性：hide 入账时的被动察觉自动对抗 + hidden 实例的观察者粒度建模。
// - hidden 实例 metadata.unseenBy 缺省 = legacy 语义：对所有无法靠感官看破的观察者隐藏
// - unseenBy 为数组 = 只对这些观察者隐藏（入账时按被动察觉自动对抗得出）
// 规则：隐匿检定对抗 DC=被动察觉，达成 DC 即成功（stealthTotal >= PP 即隐藏），与搜索平局维持隐蔽一致。
import { globalStatusManager } from '@/data/statusManager';
import type { Combatant } from '@/types/combat';
import type { StatusInstance, StatusRoundCtx } from '@/types/status';

export interface HideObserver {
  id: string;
  name: string;
  /** 被动察觉（观察者被动发现躲藏者的对抗 DC） */
  pp: number;
}

export interface HideContest {
  /** 无法定位躲藏者的观察者 ID（机械上视为看不见） */
  unseenBy: string[];
  /** 已看破位置的观察者 */
  seenBy: HideObserver[];
}

/** 被动察觉自动对抗：隐匿检定达成 DC（平局成功）即对该观察者隐藏 */
export function contestHide(stealthTotal: number, observers: HideObserver[]): HideContest {
  const unseenBy: string[] = [];
  const seenBy: HideObserver[] = [];
  for (const o of observers) {
    if (stealthTotal >= o.pp) unseenBy.push(o.id);
    else seenBy.push(o);
  }
  return { unseenBy, seenBy };
}

/** 参与躲藏对抗的观察者：除躲藏者外、存活且清醒的参战者；无被动察觉数据按 10 */
export function collectHideObservers(combatants: Combatant[], hiderId: string): HideObserver[] {
  return combatants
    .filter((o) => o.id !== hiderId && !o.isDead && !o.isUnconscious)
    .map((o) => ({ id: o.id, name: o.name, pp: o.passiveChecks?.perception ?? 10 }));
}

/** 读取目标的活跃 hidden 实例 */
export function getHiddenInstance(targetId: string, ctx?: StatusRoundCtx): StatusInstance | null {
  return (
    globalStatusManager
      .getActiveStatuses(targetId, 'combat', ctx)
      .find((i) => i.definitionId === 'hidden') ?? null
  );
}

/**
 * 观察者能否定位躲藏者（机械可见性）：
 * - 无 hidden 实例 → 可见
 * - unseenBy 缺省（legacy）→ 对所有观察者隐藏（感官看破由调用方另行判定）
 * - unseenBy 数组 → 仅列表内观察者看不见
 */
export function isHiddenFrom(hiderId: string, observerId: string, ctx?: StatusRoundCtx): boolean {
  const inst = getHiddenInstance(hiderId, ctx);
  if (!inst) return false;
  const unseenBy = inst.metadata?.unseenBy;
  if (Array.isArray(unseenBy)) return unseenBy.includes(observerId);
  return true;
}
