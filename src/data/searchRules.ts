// 搜索（Search）结算：察觉检定对抗活跃 hidden 实例的隐匿总值。
// 规则依据 SRD 5.1「Hiding」——隐匿检定的总值在被发现前持续被主动搜寻者的察觉检定对抗；
// 「Contests」——平局维持原状，因此仅在 searchTotal > stealthTotal 时解除躲藏。
// DM 端直操与玩家 op 入账共用本函数，避免两份判定口径。
import { globalStatusManager } from '@/data/statusManager';
import type { Combatant } from '@/types/combat';

export interface SearchHit {
  targetId: string;
  name: string;
  stealthTotal: number;
  /** 隐匿值来自特性转换的被动代填（非实际掷骰），提示 DM 复核 */
  estimated: boolean;
}

export interface SearchResolution {
  /** 被发现的躲藏者（hidden 实例已解除） */
  revealed: SearchHit[];
  /** 处于躲藏但未录入隐匿总值的老实例（不解除，提示 DM 补录） */
  skipped: { targetId: string; name: string }[];
}

/** 读取目标的活跃 hidden 实例 */
export function getHiddenInstance(targetId: string) {
  return globalStatusManager
    .getActiveStatuses(targetId, 'combat')
    .find((i) => i.definitionId === 'hidden') ?? null;
}

/**
 * 以一次察觉检定总值搜索全图躲藏者。
 * - 排除搜索者自身；
 * - 平局不解除（严格大于才被发现）；
 * - 缺 stealthTotal 的实例跳过（老数据，待 DM 补录）。
 */
export function resolveSearch(params: {
  searcherId: string;
  total: number;
  combatants: Combatant[];
}): SearchResolution {
  const { searcherId, total, combatants } = params;
  const result: SearchResolution = { revealed: [], skipped: [] };
  for (const c of combatants) {
    if (c.id === searcherId) continue;
    const instances = globalStatusManager
      .getActiveStatuses(c.id, 'combat')
      .filter((i) => i.definitionId === 'hidden');
    for (const inst of instances) {
      const raw = inst.metadata?.stealthTotal;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        result.skipped.push({ targetId: c.id, name: c.name });
        continue;
      }
      if (total > raw) {
        globalStatusManager.declareEnd(inst.instanceId);
        result.revealed.push({
          targetId: c.id,
          name: c.name,
          stealthTotal: raw,
          estimated: inst.metadata?.stealthSource === 'passive',
        });
      }
    }
  }
  return result;
}
