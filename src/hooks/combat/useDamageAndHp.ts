import combatStore from '@/data/combatStore';
import type { CombatRecord, Combatant } from '@/types/combat';

export interface UseDamageAndHpProps {
  currentTurn: { round: number; combatantId: string } | null;
  playbackMode: boolean;
}

export function useDamageAndHp(
  record: CombatRecord | null,
  props: UseDamageAndHpProps,
) {
  const { currentTurn, playbackMode } = props;

  /**
   * 应用伤害：写入 combatant HP / 昏迷/死亡状态，自动管理死亡豁免待办生命周期。
   * PC HP ≤ 0 未传 status 时自动判定为昏迷。
   */
  const handleApplyDamage = (
    targetId: string,
    newHp: number,
    status?: 'unconscious' | 'dead',
  ) => {
    if (!record) return;
    const target = record.combatants.find(c => c.id === targetId);
    const wasUnconscious = target?.isUnconscious ?? false;
    const isPc = target?.isPc ?? false;
    const effectiveStatus: 'unconscious' | 'dead' | undefined =
      status ?? (newHp <= 0 && isPc ? 'unconscious' : undefined);

    const updatedCombatants = record.combatants.map(c => {
      if (c.id !== targetId) return c;
      if (newHp <= 0 && effectiveStatus === 'dead') {
        return { ...c, currentHp: newHp, isDead: true, isUnconscious: false };
      }
      if (newHp <= 0 && effectiveStatus === 'unconscious') {
        const firstDown = !wasUnconscious;
        return {
          ...c,
          currentHp: newHp,
          isDead: false,
          isUnconscious: true,
          deathSaveFailures: firstDown ? 0 : (c.deathSaveFailures ?? 0),
          deathSaveSuccesses: firstDown ? 0 : (c.deathSaveSuccesses ?? 0),
        };
      }
      return {
        ...c,
        currentHp: newHp,
        isDead: false,
        isUnconscious: false,
        deathSaveFailures: 0,
        deathSaveSuccesses: 0,
      };
    });
    combatStore.update(record.id, { combatants: updatedCombatants, updatedAt: Date.now() });

    if (playbackMode && isPc) {
      const nowDown = newHp <= 0 && effectiveStatus === 'unconscious';
      if (nowDown) {
        const existing = combatStore.get(record.id)?.turnTodos?.some(
          t => t.type === 'death_save' && t.combatantId === targetId,
        );
        if (!existing) {
          const startRound = currentTurn ? currentTurn.round : 0;
          combatStore.addTurnTodo(record.id, {
            combatantId: targetId,
            name: '死亡豁免',
            type: 'death_save',
            startRound,
            endRound: -1,
          });
        }
      }
    }
    if (playbackMode) autoFillDownedMarkers();
    combatStore.cleanupDeathSaveTodos(record.id);
  };

  /**
   * 为已昏迷/死亡角色在所有未填写的后续轮次填入「昏迷」/「死亡」占位。
   * 必须从 combatStore.get 取最新数据，避免闭包中的 record 是旧快照。
   */
  const autoFillDownedMarkers = () => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    let updatedRounds = latest.rounds.map(r => ({ ...r }));
    let changed = false;
    latest.combatants.forEach(c => {
      if (!c.isDead && !c.isUnconscious) return;
      const marker = c.isDead ? '死亡' : '昏迷中，无法行动';
      updatedRounds = updatedRounds.map(round => {
        const cur = round[c.id];
        if (cur && cur !== '被突袭' && cur !== '昏迷中，无法行动' && cur !== '死亡') return round;
        if (cur !== marker) { changed = true; return { ...round, [c.id]: marker }; }
        return round;
      });
    });
    if (changed) combatStore.update(record.id, { rounds: updatedRounds, updatedAt: Date.now() });
  };

  return { handleApplyDamage, autoFillDownedMarkers };
}
