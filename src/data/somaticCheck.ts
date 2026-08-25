import statusLibrary from './statusLibrary';

/** 哪些 condition 会阻断姿态成分 —— 从定义的 combatantPatch 自动推导 */
function buildSomaticBlockingSet(): Set<string> {
  const ids = new Set<string>();
  for (const def of statusLibrary.list()) {
    if (def.combatantPatch && def.combatantPatch.canGesticulate === false) {
      ids.add(def.id);
    }
  }
  return ids;
}

export const SOMATIC_BLOCKING_CONDITIONS = buildSomaticBlockingSet();

export type SomaticBlockingCondition = typeof SOMATIC_BLOCKING_CONDITIONS extends Set<infer T> ? T : never;

import type { Combatant } from '@/types/combat';

/** 推导 canGesticulate
 * @param combatant 参战者
 * @param activeConditions 当前身上的状态列表（由状态管理器提供）
 * @returns true=可执行手势, false=不可执行 */
export function deriveCanGesticulate(
  combatant: Combatant,
  activeConditions: string[] = [],
): boolean {
  // 1. 失能 → 双手不可用
  if (combatant.isIncapacitated) return false;
  
  // 2. 昏迷（isUnconscious 是独立标记，也在 blocking set 中，但先短路更高效）
  if (combatant.isUnconscious) return false;
  
  // 3. 身上有任何会导致失能的状态
  for (const cond of activeConditions) {
    if (SOMATIC_BLOCKING_CONDITIONS.has(cond as SomaticBlockingCondition)) {
      return false;
    }
  }
  
  // 4. DM 手动覆盖（若已被显式设为 false，尊重手动值）
  if (combatant.canGesticulate === false) return false;
  
  // 5. 默认可通过
  return true;
}