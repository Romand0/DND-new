import combatStore from '@/data/combatStore';
import type { CombatRecord } from '@/types/combat';
import type { DamageApplication, DamageApplyResult, HealApplyResult } from '@/types/damage';

export interface UseDamageAndHpProps {
  currentTurn: { round: number; combatantId: string } | null;
  playbackMode: boolean;
}

export function useDamageAndHp(
  record: CombatRecord | null,
  props: UseDamageAndHpProps,
) {
  const { currentTurn, playbackMode } = props;

  /** 写入目标 HP / 存活状态，返回更新后的参战者数组 */
  const writeCombatantHp = (
    targetId: string,
    newHp: number,
    tempHpAfter: number,
    status: 'unconscious' | 'dead' | undefined,
    wasUnconscious: boolean,
  ) => {
    if (!record) return [];
    const latest = combatStore.get(record.id);
    if (!latest) return [];
    const updatedCombatants = latest.combatants.map(c => {
      if (c.id !== targetId) return c;
      if (newHp <= 0 && status === 'dead') {
        return { ...c, currentHp: newHp, tempHp: tempHpAfter, isDead: true, isUnconscious: false };
      }
      if (newHp <= 0 && status === 'unconscious') {
        const firstDown = !wasUnconscious;
        return {
          ...c,
          currentHp: newHp,
          tempHp: tempHpAfter,
          isDead: false,
          isUnconscious: true,
          deathSaveFailures: firstDown ? 0 : (c.deathSaveFailures ?? 0),
          deathSaveSuccesses: firstDown ? 0 : (c.deathSaveSuccesses ?? 0),
        };
      }
      return {
        ...c,
        currentHp: newHp,
        tempHp: tempHpAfter,
        isDead: false,
        isUnconscious: false,
        deathSaveFailures: 0,
        deathSaveSuccesses: 0,
      };
    });
    combatStore.update(record.id, { combatants: updatedCombatants, updatedAt: Date.now() });
    return updatedCombatants;
  };

  /**
   * 应用伤害：伤害量由攻击方显式传入（抗性/易伤后、临时 HP 吸收前），
   * 不再用目标 HP 差值反推。临时 HP 先吸收，剩余扣当前 HP。
   */
  const handleApplyDamage = (event: DamageApplication): DamageApplyResult | null => {
    if (!record) return null;
    const latest = combatStore.get(record.id);
    const target = latest?.combatants.find(c => c.id === event.targetId);
    if (!latest || !target) return null;

    const wasUnconscious = target.isUnconscious ?? false;
    const isPc = target.isPc ?? false;
    const oldHp = target.currentHp ?? 0;
    const damage = Math.max(0, Math.floor(event.amount));
    const tempHpBefore = Math.max(0, target.tempHp ?? 0);
    const tempAbsorbed = Math.min(tempHpBefore, damage);
    const tempHpAfter = tempHpBefore - tempAbsorbed;
    const hpDamage = damage - tempAbsorbed;
    const newHp = Math.max(0, oldHp - hpDamage);
    const status: 'unconscious' | 'dead' | undefined =
      newHp <= 0 ? (event.status ?? (isPc ? 'unconscious' : undefined)) : undefined;

    const updatedCombatants = writeCombatantHp(event.targetId, newHp, tempHpAfter, status, wasUnconscious);

    // 专注豁免（D&D 5e）：DC = max(10, floor(承受伤害/2))。
    // 伤害量来自攻击方结算，包含被临时 HP 吸收的部分；HP 归零时专注直接中断。
    const updatedTarget = updatedCombatants.find(c => c.id === event.targetId);
    if (playbackMode && damage > 0 && newHp > 0 && updatedTarget?.concentration) {
      const dc = Math.max(10, Math.floor(damage / 2));
      const startRound = currentTurn ? currentTurn.round : 0;
      combatStore.addTurnTodo(record.id, {
        combatantId: event.targetId,
        name: `专注豁免：${updatedTarget.concentration.spellName}`,
        type: 'concentration_save',
        startRound,
        endRound: -1,
        payload: {
          dc,
          spellName: updatedTarget.concentration.spellName,
          ability: 'constitution',
          damage,
          sourceId: event.sourceId,
          sourceName: event.sourceName,
          sourceKind: event.sourceKind,
          damageType: event.damageType,
        },
      });
    }

    if (playbackMode && isPc && newHp <= 0 && status === 'unconscious') {
      const existing = combatStore.get(record.id)?.turnTodos?.some(
        t => t.type === 'death_save' && t.combatantId === event.targetId,
      );
      if (!existing) {
        const startRound = currentTurn ? currentTurn.round : 0;
        combatStore.addTurnTodo(record.id, {
          combatantId: event.targetId,
          name: '死亡豁免',
          type: 'death_save',
          startRound,
          endRound: -1,
        });
      }
    }

    if (playbackMode) autoFillDownedMarkers();
    combatStore.cleanupDeathSaveTodos(record.id);
    combatStore.cleanupBrokenConcentration(record.id);

    return {
      targetId: event.targetId,
      oldHp,
      newHp,
      damage,
      tempAbsorbed,
      tempHpAfter,
      status,
    };
  };

  /** 应用治疗：数值由施法/恢复方显式传入，HP 不超过上限，临时 HP 保持不变 */
  const handleApplyHealing = (targetId: string, amount: number): HealApplyResult | null => {
    if (!record) return null;
    const latest = combatStore.get(record.id);
    const target = latest?.combatants.find(c => c.id === targetId);
    if (!latest || !target) return null;

    const wasUnconscious = target.isUnconscious ?? false;
    const oldHp = target.currentHp ?? 0;
    const maxHp = target.maxHp ?? oldHp;
    const healedAmount = Math.max(0, Math.floor(amount));
    const newHp = Math.min(maxHp, oldHp + healedAmount);
    const tempHpAfter = Math.max(0, target.tempHp ?? 0);

    writeCombatantHp(targetId, newHp, tempHpAfter, undefined, wasUnconscious);

    if (playbackMode) autoFillDownedMarkers();
    combatStore.cleanupDeathSaveTodos(record.id);

    return { targetId, oldHp, newHp, healed: newHp - oldHp };
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

  return { handleApplyDamage, handleApplyHealing, autoFillDownedMarkers };
}
