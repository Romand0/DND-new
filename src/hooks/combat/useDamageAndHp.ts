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
    damageAmount?: number,
  ) => {
    if (!record) return;
    const target = record.combatants.find(c => c.id === targetId);
    const wasUnconscious = target?.isUnconscious ?? false;
    const isPc = target?.isPc ?? false;

    // 临时生命值先于当前生命值扣减（D&D 5e）。damageAmount 用于保留溢出伤害：
    // 调用方常把 newHp 钳到 0，仅靠 oldHp - newHp 会丢失“超杀”部分，导致临时 HP 吸收过多。
    const oldHp = target?.currentHp ?? 0;
    const incomingDamage = Math.max(0, damageAmount ?? (oldHp - newHp));
    const tempHpBefore = Math.max(0, target?.tempHp ?? 0);
    const tempAbsorbed = Math.min(tempHpBefore, incomingDamage);
    const tempHpAfter = tempHpBefore - tempAbsorbed;
    const effectiveHp = incomingDamage > 0
      ? Math.max(0, oldHp - (incomingDamage - tempAbsorbed))
      : newHp;
    const effectiveStatus: 'unconscious' | 'dead' | undefined =
      effectiveHp <= 0
        ? (status ?? (isPc ? 'unconscious' : undefined))
        : undefined;

    const updatedCombatants = record.combatants.map(c => {
      if (c.id !== targetId) return c;
      if (effectiveHp <= 0 && effectiveStatus === 'dead') {
        return { ...c, currentHp: effectiveHp, tempHp: tempHpAfter, isDead: true, isUnconscious: false };
      }
      if (effectiveHp <= 0 && effectiveStatus === 'unconscious') {
        const firstDown = !wasUnconscious;
        return {
          ...c,
          currentHp: effectiveHp,
          tempHp: tempHpAfter,
          isDead: false,
          isUnconscious: true,
          deathSaveFailures: firstDown ? 0 : (c.deathSaveFailures ?? 0),
          deathSaveSuccesses: firstDown ? 0 : (c.deathSaveSuccesses ?? 0),
        };
      }
      return {
        ...c,
        currentHp: effectiveHp,
        tempHp: tempHpAfter,
        isDead: false,
        isUnconscious: false,
        deathSaveFailures: 0,
        deathSaveSuccesses: 0,
      };
    });
    combatStore.update(record.id, { combatants: updatedCombatants, updatedAt: Date.now() });

    // 专注豁免（D&D 5e）：非失能性伤害且 HP 仍 > 0 时触发体质豁免，
    // DC = max(10, floor(伤害/2))。HP 归零时专注直接被失能/昏迷打断（cleanup 清除），豁免失去意义。
    const updatedTarget = updatedCombatants.find(c => c.id === targetId);
    // 专注 DC 基于承受的伤害量（含被临时 HP 吸收的部分），而非当前 HP 实际降幅
    if (playbackMode && incomingDamage > 0 && effectiveHp > 0 && updatedTarget?.concentration) {
      const dc = Math.max(10, Math.floor(incomingDamage / 2));
      const startRound = currentTurn ? currentTurn.round : 0;
      combatStore.addTurnTodo(record.id, {
        combatantId: targetId,
        name: `专注豁免：${updatedTarget.concentration.spellName}`,
        type: 'concentration_save',
        startRound,
        endRound: -1,
        payload: {
          dc,
          spellName: updatedTarget.concentration.spellName,
          ability: 'constitution',
        },
      });
    }

    if (playbackMode && isPc) {
      const nowDown = effectiveHp <= 0 && effectiveStatus === 'unconscious';
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
    combatStore.cleanupBrokenConcentration(record.id);
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
