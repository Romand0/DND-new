import { useState } from 'react';
import type { CombatRecord, Combatant, RoundAction, EquipmentChanges } from '@/types/combat';
import battlegroundStore from '@/data/battlegroundStore';
import combatStore from '@/data/combatStore';

export type TurnSnapshot = {
  combatants: Combatant[];
  rounds: RoundAction[];
  battleground: any[];
  equipmentChanges?: Record<string, EquipmentChanges>;
};

export interface UseRoundTurnProps {
  autoFillDownedMarkers: () => void;
  resetCombatantActions: (id: string) => void;
  rollbackSnapshotRef: React.MutableRefObject<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>;
}

export function useRoundTurn(record: CombatRecord | null, props: UseRoundTurnProps) {
  const { autoFillDownedMarkers, resetCombatantActions, rollbackSnapshotRef } = props;
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<{ round: number; combatantId: string } | null>(null);
  const [confirmEndTurnOpen, setConfirmEndTurnOpen] = useState(false);
  const [setRewindModal] = useState<any>(null); // 占位，不在这里用

  const handleCellChange = (roundIndex: number, combatantId: string, value: string) => {
    if (!record) return;
    const updatedRounds = [...record.rounds];
    updatedRounds[roundIndex] = {
      ...updatedRounds[roundIndex],
      [combatantId]: value,
    };
    combatStore.update(record.id, { rounds: updatedRounds, updatedAt: Date.now() });
  };

  const appendRoundRecord = (round: number, combatantId: string, newLine: string) => {
    if (!record) return;
    const existing = record.rounds[round]?.[combatantId] || '';
    const finalText = existing ? `${existing}\n${newLine}` : newLine;
    handleCellChange(round, combatantId, finalText);
  };

  const findNextValidTurn = (
    fromRound: number,
    fromCol: number,
    roundsOverride?: RoundAction[],
  ): { round: number; combatantId: string } | null => {
    if (!record) return null;
    const rounds = roundsOverride ?? record.rounds;
    const latestTodos = combatStore.get(record.id)?.turnTodos ?? record.turnTodos ?? [];
    const hasActiveDeathSave = (combatantId: string, round: number) =>
      latestTodos.some(t =>
        t.type === 'death_save' &&
        t.combatantId === combatantId &&
        !t.executed &&
        t.startRound <= round &&
        (t.endRound === -1 || t.endRound >= round)
      );
    for (let r = fromRound; r < rounds.length; r++) {
      const startCol = r === fromRound ? fromCol : 0;
      for (let i = startCol; i < record.combatants.length; i++) {
        const c = record.combatants[i];
        const v = rounds[r][c.id];
        if (v === '被突袭' || v === '死亡') continue;
        if (v === '昏迷中，无法行动') {
          if (!hasActiveDeathSave(c.id, r)) continue;
        }
        return { round: r, combatantId: c.id };
      }
    }
    return null;
  };

  const takeTurnSnapshot = (round: number, combatantId: string) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const bg = battlegroundStore.get(record.id);
    const snap: TurnSnapshot = {
      combatants: latest.combatants.map(c => ({ ...c })),
      rounds: latest.rounds.map(r => ({ ...r })),
      battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
      equipmentChanges: latest.equipmentChanges
        ? Object.fromEntries(
            Object.entries(latest.equipmentChanges).map(([k, v]) => [
              k,
              { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
            ]),
          )
        : undefined,
    };
    const key = `${round}:${combatantId}`;
    if (!rollbackSnapshotRef.current.snapshots[key]) {
      rollbackSnapshotRef.current.snapshots[key] = snap;
    }
  };

  const applyRollback = (round: number, combatantIdx: number) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const combatantId = latest.combatants[combatantIdx]?.id;
    if (!combatantId) return;
    const key = `${round}:${combatantId}`;
    const snap = rollbackSnapshotRef.current.snapshots[key] ?? rollbackSnapshotRef.current.initial;
    if (!snap) {
      alert('回溯失败：未找到该回合的快照，请先至少推进一个回合后再回溯');
      return;
    }
    const restoredCombatants = snap.combatants.map(c => ({ ...c }));
    const restoredRounds = snap.rounds.map(r => ({ ...r }));
    const totalCombatants = restoredCombatants.length;
    const totalRounds = restoredRounds.length;
    for (let r = 0; r < totalRounds; r++) {
      for (let c = 0; c < totalCombatants; c++) {
        const cid = restoredCombatants[c].id;
        const isAfter = r > round || (r === round && c > combatantIdx);
        if (isAfter) {
          const cur = restoredRounds[r]?.[cid];
          if (cur && cur !== '被突袭' && cur !== '昏迷中，无法行动' && cur !== '死亡') {
            restoredRounds[r] = { ...restoredRounds[r], [cid]: '' };
          }
        }
      }
    }
    combatStore.update(record.id, {
      combatants: restoredCombatants,
      rounds: restoredRounds,
      equipmentChanges: snap.equipmentChanges
        ? Object.fromEntries(
            Object.entries(snap.equipmentChanges).map(([k, v]) => [
              k,
              { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
            ]),
          )
        : undefined,
      updatedAt: Date.now(),
    });
    battlegroundStore.setTokens(record.id, snap.battleground.map(t => ({ ...t })));
    setCurrentTurn({ round, combatantId });
    delete rollbackSnapshotRef.current.snapshots[key];
  };

  const advanceTurn = () => {
    if (!currentTurn || !record) return;
    const currentIdx = record.combatants.findIndex(c => c.id === currentTurn.combatantId);
    const next = findNextValidTurn(currentTurn.round, currentIdx + 1);
    if (next) {
      if (next.round > currentTurn.round) combatStore.resetTurnTodosForRound(record.id, next.round);
      setCurrentTurn(next);
      resetCombatantActions(next.combatantId);
      takeTurnSnapshot(next.round, next.combatantId);
      return;
    }
    const aliveCount = record.combatants.filter(c => !c.isDead && !c.isUnconscious).length;
    if (aliveCount === 0) {
      setCurrentTurn(null);
      setPlaybackStarted(false);
      alert('战斗已结束（所有参战者已倒地或死亡）。');
      return;
    }
    const nextRound = currentTurn.round + 1;
    if (nextRound >= record.rounds.length) {
      const newRound: RoundAction = {};
      record.combatants.forEach(c => {
        if (c.isDead) newRound[c.id] = '死亡';
        else if (c.isUnconscious) newRound[c.id] = '昏迷中，无法行动';
        else newRound[c.id] = '';
      });
      const updatedRounds = [...record.rounds, newRound];
      combatStore.update(record.id, { rounds: updatedRounds, updatedAt: Date.now() });
      combatStore.resetTurnTodosForRound(record.id, nextRound);
      const firstInNew = findNextValidTurn(nextRound, 0, updatedRounds);
      if (firstInNew) {
        setCurrentTurn(firstInNew);
        resetCombatantActions(firstInNew.combatantId);
        takeTurnSnapshot(firstInNew.round, firstInNew.combatantId);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    } else {
      combatStore.resetTurnTodosForRound(record.id, nextRound);
      const firstInNext = findNextValidTurn(nextRound, 0);
      if (firstInNext) {
        setCurrentTurn(firstInNext);
        resetCombatantActions(firstInNext.combatantId);
        takeTurnSnapshot(firstInNext.round, firstInNext.combatantId);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    }
  };

  const confirmEndTurn = () => {
    setConfirmEndTurnOpen(false);
    advanceTurn();
  };

  const resolveWriteCell = (attackerId: string): { round: number; combatantId: string } | null => {
    if (!record) return null;
    if (record.mode === 'playback' && playbackStarted && currentTurn) {
      return { round: currentTurn.round, combatantId: currentTurn.combatantId };
    }
    const round = Math.max(0, record.rounds.length - 1);
    return { round, combatantId: attackerId };
  };

  return {
    currentTurn,
    setCurrentTurn,
    playbackStarted,
    setPlaybackStarted,
    confirmEndTurnOpen,
    setConfirmEndTurnOpen,
    handleCellChange,
    appendRoundRecord,
    findNextValidTurn,
    takeTurnSnapshot,
    applyRollback,
    advanceTurn,
    confirmEndTurn,
    resolveWriteCell,
  };
}
