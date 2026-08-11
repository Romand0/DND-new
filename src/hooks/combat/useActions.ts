import combatStore from '@/data/combatStore';
import type { CombatRecord } from '@/types/combat';

export function useActions(record: CombatRecord | null) {
  const currentMode = (): 'simulation' | 'playback' =>
    record?.mode === 'playback' ? 'playback' : 'simulation';

  const canUseAction = (combatantId: string): boolean => {
    if (!record) return false;
    const c = record.combatants.find(x => x.id === combatantId);
    if (!c) return false;
    if (c.isIncapacitated || c.isUnconscious || c.isDead) return false;
    if (currentMode() === 'simulation') return true;
    return (typeof c.actions === 'number' ? c.actions : 1) > 0;
  };

  /** 附赠动作可用性：放映模式下检查次数，模拟模式无限 */
  const canUseBonusAction = (combatantId: string): boolean => {
    if (!record) return false;
    const c = record.combatants.find(x => x.id === combatantId);
    if (!c) return false;
    if (c.isIncapacitated || c.isUnconscious || c.isDead) return false;
    if (currentMode() === 'simulation') return true;
    return (typeof c.bonusActions === 'number' ? c.bonusActions : 1) > 0;
  };

  const consumeCombatantAction = (combatantId: string) => {
    if (!record) return;
    combatStore.consumeAction(record.id, combatantId, currentMode());
  };

  /** 消耗附赠动作 */
  const consumeCombatantBonusAction = (combatantId: string) => {
    if (!record) return;
    combatStore.consumeBonusAction(record.id, combatantId, currentMode());
  };

  const markLoadingAttacked = (combatantId: string) => {
    if (!record || currentMode() !== 'playback') return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    combatStore.update(record.id, {
      loadingAttackedThisRound: {
        ...(latest.loadingAttackedThisRound || {}),
        [combatantId]: true,
      },
      updatedAt: Date.now(),
    });
  };

  const resetCombatantActions = (combatantId: string) => {
    if (!record) return;
    if (record.mode !== 'playback') return;
    combatStore.resetActions(record.id, combatantId);
  };

  return {
    currentMode,
    canUseAction,
    canUseBonusAction,
    isIncapacitated: (combatantId: string): boolean => {
      if (!record) return false;
      const c = record.combatants.find(x => x.id === combatantId);
      return !!c?.isIncapacitated;
    },
    consumeCombatantAction,
    consumeCombatantBonusAction,
    markLoadingAttacked,
    resetCombatantActions,
  };
}
