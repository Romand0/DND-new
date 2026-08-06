import { useState } from 'react';
import type { CombatRecord, RoundAction, EquipmentChanges } from '@/types/combat';
import combatStore from '@/data/combatStore';
import battlegroundStore from '@/data/battlegroundStore';
import type { TurnSnapshot } from './useRoundTurn';

export interface UsePlaybackProps {
  playbackStarted: boolean;
  setPlaybackStarted: (v: boolean) => void;
  currentTurn: { round: number; combatantId: string } | null;
  setCurrentTurn: (v: { round: number; combatantId: string } | null) => void;
  rollbackSnapshotRef: React.MutableRefObject<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>;
  playbackSnapshotRef: React.MutableRefObject<any>;
  findNextValidTurn: (fromRound: number, fromCol: number, roundsOverride?: RoundAction[]) => { round: number; combatantId: string } | null;
  resetCombatantActions: (id: string) => void;
  takeTurnSnapshot: (round: number, combatantId: string) => void;
  autoFillDownedMarkers: () => void;
  selectedCell: { round: number; combatantId: string } | null;
}

export function usePlayback(record: CombatRecord | null, props: UsePlaybackProps) {
  const {
    playbackStarted, setPlaybackStarted,
    currentTurn, setCurrentTurn,
    rollbackSnapshotRef, playbackSnapshotRef,
    findNextValidTurn, resetCombatantActions, takeTurnSnapshot,
    autoFillDownedMarkers, selectedCell,
  } = props;

  const [exitPlaybackModalOpen, setExitPlaybackModalOpen] = useState(false);

  const commitModeChange = (mode: 'simulation' | 'playback') => {
    if (!record) return;
    combatStore.update(record.id, { mode, updatedAt: Date.now() });
  };

  const handleModeChange = (mode: 'simulation' | 'playback') => {
    if (!record) return;
    if (record.mode === mode) return;
    if (record.mode === 'playback' && mode === 'simulation') {
      if (playbackStarted || playbackSnapshotRef.current) {
        setExitPlaybackModalOpen(true);
        return;
      }
    }
    commitModeChange(mode);
    if (mode === 'playback') {
      const bg = battlegroundStore.get(record.id);
      const latestForSnapshot = combatStore.get(record.id);
      playbackSnapshotRef.current = (bg?.tokens ?? []).map((t: any) => ({ ...t }));
      rollbackSnapshotRef.current = {
        initial: {
          combatants: record.combatants.map(c => ({ ...c })),
          rounds: record.rounds.map(r => ({ ...r })),
          battleground: (bg?.tokens ?? []).map((t: any) => ({ ...t })),
          equipmentChanges: latestForSnapshot?.equipmentChanges
            ? Object.fromEntries(
                Object.entries(latestForSnapshot.equipmentChanges).map(([k, v]) => [
                  k,
                  { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
                ]),
              )
            : undefined,
        },
        snapshots: {},
      };
    }
  };

  const finalizeExitPlayback = (preserveChanges: boolean) => {
    if (record?.mode !== 'playback') {
      setExitPlaybackModalOpen(false);
      return;
    }
    if (!preserveChanges) {
      const init = rollbackSnapshotRef.current.initial;
      if (init) {
        combatStore.update(record.id, {
          combatants: init.combatants.map(c => ({ ...c })),
          rounds: init.rounds.map(r => ({ ...r })),
          equipmentChanges: init.equipmentChanges
            ? Object.fromEntries(
                Object.entries(init.equipmentChanges).map(([k, v]) => [
                  k,
                  { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
                ]),
              )
            : undefined,
          updatedAt: Date.now(),
        });
        battlegroundStore.setTokens(record.id, init.battleground.map(t => ({ ...t })));
      } else if (playbackSnapshotRef.current) {
        battlegroundStore.setTokens(record.id, playbackSnapshotRef.current);
      }
    }
    setPlaybackStarted(false);
    setCurrentTurn(null);
    playbackSnapshotRef.current = null;
    rollbackSnapshotRef.current = { initial: null, snapshots: {} };
    setExitPlaybackModalOpen(false);
    commitModeChange('simulation');
  };

  const startPlayback = () => {
    if (!record) return;
    const init = rollbackSnapshotRef.current.initial;

    const restoredCombatants = init
      ? init.combatants.map(c => ({ ...c }))
      : record.combatants.map(c => ({ ...c }));
    let restoredRounds = init
      ? init.rounds.map(r => ({ ...r }))
      : record.rounds.map(r => ({ ...r }));
    const restoredEquipmentChanges = init?.equipmentChanges
      ? Object.fromEntries(
          Object.entries(init.equipmentChanges).map(([k, v]) => [
            k,
            { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
          ]),
        )
      : undefined;

    if (selectedCell) {
      const selRound = selectedCell.round;
      const selColIdx = restoredCombatants.findIndex(c => c.id === selectedCell.combatantId);
      restoredRounds = restoredRounds.map(r => ({ ...r }));
      for (let r = 0; r < restoredRounds.length; r++) {
        for (let c = 0; c < restoredCombatants.length; c++) {
          const cid = restoredCombatants[c].id;
          const isAfter = r > selRound || (r === selRound && c > selColIdx);
          if (isAfter) {
            const cur = restoredRounds[r]?.[cid];
            if (cur && cur !== '被突袭' && cur !== '昏迷' && cur !== '死亡') {
              restoredRounds[r] = { ...restoredRounds[r], [cid]: '' };
            }
          }
        }
      }
    }

    combatStore.update(record.id, {
      combatants: restoredCombatants,
      rounds: restoredRounds,
      equipmentChanges: restoredEquipmentChanges,
      updatedAt: Date.now(),
    });

    if (init) {
      battlegroundStore.setTokens(record.id, init.battleground.map(t => ({ ...t })));
    } else if (playbackSnapshotRef.current) {
      battlegroundStore.setTokens(record.id, playbackSnapshotRef.current);
    }

    combatStore.cleanupDeathSaveTodos(record.id);
    autoFillDownedMarkers();

    let startRound = 0;
    let startCol = 0;
    if (selectedCell) {
      startRound = selectedCell.round;
      const colIdx = restoredCombatants.findIndex(c => c.id === selectedCell.combatantId);
      startCol = Math.max(0, colIdx);
    }
    const firstTurn = findNextValidTurn(startRound, startCol, restoredRounds);
    setCurrentTurn(firstTurn);
    setPlaybackStarted(true);
    if (firstTurn) {
      combatStore.resetTurnTodosForRound(record.id, firstTurn.round);
      resetCombatantActions(firstTurn.combatantId);
      takeTurnSnapshot(firstTurn.round, firstTurn.combatantId);
    }
  };

  return {
    exitPlaybackModalOpen,
    setExitPlaybackModalOpen,
    commitModeChange,
    handleModeChange,
    finalizeExitPlayback,
    startPlayback,
  };
}
