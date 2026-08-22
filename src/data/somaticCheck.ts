/** 会使双手均不可用、从而无法执行 S 成分的状态名 */
const SOMATIC_BLOCKING_CONDITIONS = new Set([
  'grappled',     // 擒抱
  'paralyzed',    // 麻痹
  'petrified',    // 石化
  'stunned',      // 震慑
  'unconscious',  // 昏迷
] as const);

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