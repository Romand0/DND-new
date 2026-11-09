import type { Combatant } from '@/types/combat';
import { globalStatusManager } from './statusManager';
import statusLibrary from './statusLibrary';
import { SOMATIC_BLOCKING_CONDITIONS } from './somaticCheck';

export interface CombatantStatusFlags {
  isIncapacitated: boolean;
  canSpeak: boolean;
  canGesticulate: boolean;
  concentrationBroken: boolean;
}

const INCAPACITATING_DEFINITION_IDS = new Set(
  statusLibrary.list()
    .filter(def => def.combatantPatch?.isIncapacitated === true)
    .map(def => def.id),
);

/** 目标当前活跃状态 definitionId（战斗范围） */
export function listActiveDefinitionIds(targetId: string): string[] {
  return globalStatusManager.getActiveStatuses(targetId, 'combat').map(i => i.definitionId);
}

/**
 * 从活跃状态 + HP 标志推导参战者能力字段。
 * 不回读旧 isIncapacitated / canSpeak / canGesticulate，避免回合重置或过期状态把标志写脏。
 */
export function deriveCombatantStatusFlags(
  combatant: Pick<Combatant, 'id' | 'isDead' | 'isUnconscious'>,
): CombatantStatusFlags {
  const down = !!(combatant.isDead || combatant.isUnconscious);
  const effects = globalStatusManager.getEffects(combatant.id, 'combat');
  const definitionIds = listActiveDefinitionIds(combatant.id);
  const fromStatus = effects.some(e => e.type === 'action_block')
    || definitionIds.some(id => INCAPACITATING_DEFINITION_IDS.has(id));
  const isIncapacitated = down || fromStatus;
  const speechBlocked = effects.some(e => e.type === 'speech_block');
  const somaticBlocked = definitionIds.some(id => SOMATIC_BLOCKING_CONDITIONS.has(id));
  const concentrationBlocked = effects.some(
    e => e.type === 'concentration_break' || e.type === 'concentration_block',
  );

  return {
    isIncapacitated,
    canSpeak: !(down || isIncapacitated || speechBlocked),
    canGesticulate: !(down || isIncapacitated || somaticBlocked),
    concentrationBroken: down || isIncapacitated || concentrationBlocked,
  };
}

/** 死亡 / 昏迷 / 失能时的动作拒绝原因；可行动时返回 null */
export function actionDeniedReason(
  combatant: Pick<Combatant, 'isDead' | 'isUnconscious' | 'isIncapacitated'>,
): string | null {
  if (combatant.isDead) return '该参战者已死亡，无法行动';
  if (combatant.isUnconscious) return '该参战者已昏迷，无法行动';
  if (combatant.isIncapacitated) return '该参战者已失能，无法行动';
  return null;
}
