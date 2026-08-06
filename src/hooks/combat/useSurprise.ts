import { useState, SetStateAction } from 'react';
import type { CombatRecord } from '@/types/combat';
import combatStore from '@/data/combatStore';

export function useSurprise(record: CombatRecord | null) {
  const [surpriseAttackOpen, setSurpriseAttackOpen] = useState(false);
  const [surpriseAttackRound, setSurpriseAttackRound] = useState(0);
  const [surprisedCombatants, setSurprisedCombatants] = useState<Set<string>>(new Set());

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
  };

  return {
    surpriseAttackOpen,
    setSurpriseAttackOpen,
    surpriseAttackRound,
    surprisedCombatants,
    setSurprisedCombatants: setSurprisedCombatants as unknown as React.Dispatch<SetStateAction<Set<string>>>,
    openSurpriseAttackModal,
    confirmSurpriseAttack,
  };
}
