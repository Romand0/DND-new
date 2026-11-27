import combatStore from '@/data/combatStore';
import { isRegenSuppressedBy } from '@/data/regeneration';
import { restoreWildShapeForm } from '@/data/wildShapeBeasts';
import type { CombatRecord, Combatant } from '@/types/combat';
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

  /** 写入目标 HP / 存活状态，返回更新后的参战者数组；replacement 传入时用其整体替换（野形破碎还原用） */
  const writeCombatantHp = (
    targetId: string,
    newHp: number,
    tempHpAfter: number,
    status: 'unconscious' | 'dead' | undefined,
    wasUnconscious: boolean,
    replacement?: Combatant,
    suppressRegen = false,
  ) => {
    if (!record) return [];
    const latest = combatStore.get(record.id);
    if (!latest) return [];
    const updatedCombatants = latest.combatants.map(c => {
      if (c.id !== targetId) return c;
      const base = replacement ?? c;
      // 再生失效标记：受到特质否定类型伤害时置位，回合开始时消费清除（跨伤害保留）
      const regenSuppressed = suppressRegen || base.regenSuppressed;
      if (newHp <= 0 && status === 'dead') {
        return { ...base, currentHp: newHp, tempHp: tempHpAfter, isDead: true, isUnconscious: false, regenSuppressed };
      }
      if (newHp <= 0 && status === 'unconscious') {
        const firstDown = !wasUnconscious;
        return {
          ...base,
          currentHp: newHp,
          tempHp: tempHpAfter,
          isDead: false,
          isUnconscious: true,
          deathSaveFailures: firstDown ? 0 : (base.deathSaveFailures ?? 0),
          deathSaveSuccesses: firstDown ? 0 : (base.deathSaveSuccesses ?? 0),
          regenSuppressed,
        };
      }
      return {
        ...base,
        currentHp: newHp,
        tempHp: tempHpAfter,
        isDead: false,
        isUnconscious: false,
        deathSaveFailures: 0,
        deathSaveSuccesses: 0,
        regenSuppressed,
      };
    });
    combatStore.update(record.id, { combatants: updatedCombatants, updatedAt: Date.now() });
    combatStore.syncCombatantStatusFlags(record.id, targetId);
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
    const oldHp = target.currentHp ?? 0;
    const damage = Math.max(0, Math.floor(event.amount));
    const tempHpBefore = Math.max(0, target.tempHp ?? 0);

    // 0 伤害（免疫/全吸收）不写状态，避免把昏迷或死亡目标“唤醒”
    if (damage <= 0 && !event.status) {
      const currentStatus: 'unconscious' | 'dead' | undefined =
        target.isDead ? 'dead' : (target.isUnconscious ? 'unconscious' : undefined);
      return {
        targetId: event.targetId,
        oldHp,
        newHp: oldHp,
        damage: 0,
        tempAbsorbed: 0,
        tempHpAfter: tempHpBefore,
        status: currentStatus,
      };
    }

    const tempAbsorbed = Math.min(tempHpBefore, damage);
    const tempHpAfter = tempHpBefore - tempAbsorbed;
    const hpDamage = damage - tempAbsorbed;
    let newHp = Math.max(0, oldHp - hpDamage);

    // 野形破碎（德鲁伊荒野变形 5e 规则）：野兽形态 HP 归 0 时自动恢复原形，
    // 溢出伤害（超出野兽 HP 的部分）扣原形 HP；还原后 HP 决定原形存活状态。
    // writeCombatantHp 用还原后的参战者对象落账（名字/AC/攻击等一并还原）。
    let wildShapeBroken: DamageApplyResult['wildShapeBroken'];
    let effectiveTarget: Combatant = target;
    if (target.wildShape && hpDamage > 0 && newHp <= 0) {
      const snap = target.wildShape.snapshot;
      const overflow = hpDamage - oldHp;
      const restoredHp = Math.max(0, (snap.currentHp ?? 0) - overflow);
      wildShapeBroken = {
        beastName: target.wildShape.beastName,
        overflow,
        restoredName: snap.name,
        restoredHp,
      };
      effectiveTarget = restoreWildShapeForm({ ...target, wildShape: { ...target.wildShape, snapshot: { ...snap, currentHp: restoredHp } } });
      newHp = restoredHp;
    }

    // 尸体不会被伤害“复活”；NPC 未指定致命状态时默认死亡，避免 0 HP 仍站立。
    // 有再生的怪物例外：0 HP 先记为昏迷（未毁），待其回合开始按再生是否生效决定回血或死亡。
    const status: 'unconscious' | 'dead' | undefined =
      newHp <= 0
        ? (effectiveTarget.isDead
          ? 'dead'
          : (event.status ?? (effectiveTarget.isPc || effectiveTarget.regenAmount ? 'unconscious' : 'dead')))
        : undefined;

    // 再生否定条件：受到火焰/强酸等伤害 → 下一回合再生失效（伤者为 0 时不触发）
    const regenHit = damage > 0
      && !!effectiveTarget.regenAmount
      && isRegenSuppressedBy(effectiveTarget.regenNegate, event.damageType);
    const updatedCombatants = writeCombatantHp(event.targetId, newHp, tempHpAfter, status, wasUnconscious, effectiveTarget, regenHit);

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

    if (playbackMode && effectiveTarget.isPc && newHp <= 0 && status === 'unconscious') {
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

    // 伤害事件（实际结算值，含临时 HP 吸收结果）：驱动玩家端飘伤害数字动画与回合摘要
    if (damage > 0 || hpDamage > 0) {
      combatStore.pushCombatEvent(record.id, {
        kind: 'damage',
        round: currentTurn ? currentTurn.round + 1 : 0,
        targetId: event.targetId,
        amount: hpDamage,
        damageType: event.damageType,
        text: `${target.name} 受到 ${hpDamage} 点${event.damageType ?? ''}伤害${tempAbsorbed > 0 ? `（临时 HP 吸收 ${tempAbsorbed}）` : ''}`,
      });
    }

    return {
      targetId: event.targetId,
      oldHp,
      newHp,
      damage,
      tempAbsorbed,
      tempHpAfter,
      status,
      wildShapeBroken,
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
    if (healedAmount <= 0) {
      return { targetId, oldHp, newHp: oldHp, healed: 0 };
    }
    const newHp = Math.min(maxHp, oldHp + healedAmount);
    const tempHpAfter = Math.max(0, target.tempHp ?? 0);

    writeCombatantHp(targetId, newHp, tempHpAfter, undefined, wasUnconscious);

    if (playbackMode) autoFillDownedMarkers();
    combatStore.cleanupDeathSaveTodos(record.id);

    // 治疗事件：驱动玩家端飘恢复数字动画与回合摘要
    if (newHp - oldHp > 0) {
      combatStore.pushCombatEvent(record.id, {
        kind: 'heal',
        round: currentTurn ? currentTurn.round + 1 : 0,
        targetId,
        amount: newHp - oldHp,
        text: `${target.name} 恢复 ${newHp - oldHp} 点生命`,
      });
    }

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
