// 地形区域效果落地：进入区域 / 回合结束时结算伤害，按回合清理过期区域。
// 纯计算由 zoneRules 提供；本 hook 只负责「读沙盘 → 算伤害 → 走 handleApplyDamage → 写日志」。
import { useCallback, useRef } from 'react';
import battlegroundStore from '@/data/battlegroundStore';
import { computeZoneDamage, findTokenPos } from '@/data/zoneRules';
import type { CombatRecord, OperationLogEntry } from '@/types/combat';
import type { DamageApplication, DamageApplyResult } from '@/types/damage';

export interface UseZoneEffectsProps {
  applyDamage: (event: DamageApplication) => DamageApplyResult | null;
  recordOperation: (combatantId: string | null, text: string, kind: OperationLogEntry['kind']) => void;
}

/** 同一参战者同回合同一区域的重复触发拦截（会话内即时生效，不等 store 回写） */
export function useZoneEffects(record: CombatRecord | null, props: UseZoneEffectsProps) {
  const { applyDamage, recordOperation } = props;
  const firedRef = useRef<Set<string>>(new Set());

  /**
   * 结算一次区域伤害。
   * @param combatantId 目标参战者
   * @param round 当前回合号（模拟模式传 0）
   * @param trigger 进入区域 / 回合结束
   * @param pos 可选：目标当前格子（移动进入时由调用方直接给出，避免读到旧 store）
   */
  const resolveZone = useCallback((
    combatantId: string,
    round: number,
    trigger: 'enter' | 'end_turn',
    pos?: { col: number; row: number } | null,
  ) => {
    if (!record) return null;
    const latest = battlegroundStore.get(record.id);
    if (!latest) return null;
    const combatant = record.combatants.find(c => c.id === combatantId);
    if (!combatant) return null;
    const cell = pos ?? findTokenPos(latest.tokens, combatantId);
    if (!cell) return null;

    const event = computeZoneDamage(latest.zones, combatant, cell, round, trigger, record.id);
    if (!event) return null;

    // 会话内去重：同一回合同一区域只触发一次（store 的 hitRounds 作为跨帧持久层）
    const fireKey = `${event.zoneId}:${combatantId}:${round}`;
    if (round > 0 && firedRef.current.has(fireKey)) return null;
    if (round > 0) firedRef.current.add(fireKey);

    const result = applyDamage({
      targetId: combatantId,
      amount: event.amount,
      sourceId: undefined,
      sourceName: event.zoneLabel,
      sourceKind: 'effect',
      damageType: event.damageType,
    });

    // 登记受伤回合：同回合再次进入 / 结束回合不再重复结算
    if (round > 0) {
      const zone = (latest.zones ?? []).find(z => z.id === event.zoneId);
      if (zone) {
        battlegroundStore.updateZone(record.id, zone.id, {
          hitRounds: { ...(zone.hitRounds ?? {}), [combatantId]: round },
        });
      }
    }

    const oldHp = result?.oldHp ?? combatant.currentHp ?? 0;
    const newHp = result?.newHp ?? oldHp;
    const triggerText = trigger === 'enter' ? '进入' : '回合结束于';
    let text = `${triggerText}【${event.zoneLabel}】→ ${combatant.name}：【${event.amount}】${event.damageType}伤害`;
    if (event.resolution && event.amount !== event.baseAmount) {
      text += `（${event.baseAmount}→${event.amount}）`;
    }
    text += `，HP【${oldHp}→${newHp}】`;
    if (result?.tempAbsorbed) text += `，临时HP吸收${result.tempAbsorbed}`;
    if (result?.status === 'unconscious') text += '，击昏';
    else if (result?.status === 'dead') text += '，杀死';
    recordOperation(combatantId, text, 'damage');

    return { event, result };
  }, [record, applyDamage, recordOperation]);

  /** 棋子移动落点后调用（含拖拽与点击两条路径） */
  const handleTokenMoved = useCallback((combatantId: string, pos: { col: number; row: number }, round: number) => {
    return resolveZone(combatantId, round, 'enter', pos);
  }, [resolveZone]);

  /** 完成回合时对当前回合角色结算「在该区域结束回合」伤害 */
  const resolveEndTurnZone = useCallback((combatantId: string, round: number) => {
    return resolveZone(combatantId, round, 'end_turn');
  }, [resolveZone]);

  /** 进入新回合：清理过期区域，返回被移除的区域（供日志） */
  const expireZonesForRound = useCallback((round: number) => {
    if (!record) return [];
    // 清理会话内去重表，避免无界增长
    firedRef.current = new Set(
      [...firedRef.current].filter(key => {
        const parts = key.split(':');
        const r = Number(parts[parts.length - 1]);
        return Number.isFinite(r) && r >= round;
      }),
    );
    return battlegroundStore.expireZones(record.id, round);
  }, [record]);

  return { handleTokenMoved, resolveEndTurnZone, expireZonesForRound };
}
