import { useState } from 'react';
import type { CombatRecord } from '@/types/combat';
import combatStore from '@/data/combatStore';

export interface UseSurpriseProps {
  /**
   * 确认突袭后的回调。页面据此判断是否处于「从头播放」流程
   * （pendingRestartPlayback）并启动放映；与突袭状态本身解耦。
   */
  onConfirmed?: () => void;
}

/**
 * 突袭回合标记：管理「被突袭」角色的选择弹窗与写入。
 * 逻辑与 CombatSession 内联实现逐行一致（页面为权威源）。
 */
export function useSurprise(record: CombatRecord | null, props: UseSurpriseProps = {}) {
  const { onConfirmed } = props;
  const [surpriseAttackOpen, setSurpriseAttackOpen] = useState(false);
  const [surpriseAttackRound, setSurpriseAttackRound] = useState(0);
  const [surprisedCombatants, setSurprisedCombatants] = useState<Set<string>>(new Set());

  /** 打开突袭选择窗口，并载入该轮已被标记为「被突袭」的角色 */
  const openSurpriseAttackModal = (round: number) => {
    setSurpriseAttackRound(round);
    const existing = new Set<string>();
    const roundData = record?.rounds?.[round];
    if (roundData) {
      Object.entries(roundData).forEach(([id, val]) => {
        if (val === '被突袭') existing.add(id);
      });
    }
    setSurprisedCombatants(existing);
    setSurpriseAttackOpen(true);
  };

  const closeSurpriseAttackModal = () => {
    setSurpriseAttackOpen(false);
    setSurprisedCombatants(new Set());
  };

  const toggleSurprisedCombatant = (combatantId: string) => {
    setSurprisedCombatants(prev => {
      const next = new Set(prev);
      if (next.has(combatantId)) next.delete(combatantId);
      else next.add(combatantId);
      return next;
    });
  };

  const confirmSurpriseAttack = () => {
    if (!record) return;
    const updatedRounds = [...record.rounds];
    updatedRounds[surpriseAttackRound] = { ...updatedRounds[surpriseAttackRound] };
    record.combatants.forEach(c => {
      if (surprisedCombatants.has(c.id)) {
        updatedRounds[surpriseAttackRound][c.id] = '被突袭';
      } else {
        if (updatedRounds[surpriseAttackRound][c.id] === '被突袭' && !surprisedCombatants.has(c.id)) {
          updatedRounds[surpriseAttackRound][c.id] = '';
        }
      }
    });
    combatStore.update(record.id, {
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
    setSurpriseAttackOpen(false);
    setSurprisedCombatants(new Set());
    onConfirmed?.();
  };

  return {
    surpriseAttackOpen,
    surpriseAttackRound,
    surprisedCombatants,
    setSurpriseAttackOpen,
    setSurprisedCombatants,
    openSurpriseAttackModal,
    closeSurpriseAttackModal,
    toggleSurprisedCombatant,
    confirmSurpriseAttack,
  };
}
