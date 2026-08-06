import { useMemo } from 'react';
import type { CombatRecord, Combatant } from '@/types/combat';
import type { Character, Equipment } from '@/types/character';
import { characterStore } from '@/data/characterStore';
import {
  computeCombatantAc,
  getCombatInventory,
} from '@/data/combatStore';

export function useCombatInventories(record: CombatRecord | null) {
  const combatInventories = useMemo(() => {
    if (!record) return {} as Record<string, Equipment[]>;
    const result: Record<string, Equipment[]> = {};
    for (const c of record.combatants) {
      result[c.id] = getCombatInventory(record, c);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const getEffectiveAc = (c: Combatant): number => {
    if (!record) return c.ac ?? 0;
    let character: Character | null = null;
    if (c.characterId) character = characterStore.get(c.characterId);
    const inv = combatInventories[c.id];
    if (character) return computeCombatantAc(c, character, inv);
    return c.ac ?? 0;
  };

  return { combatInventories, getEffectiveAc };
}
