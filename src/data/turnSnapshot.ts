// 回合快照构建：放映起始 / 回合推进两处共用，避免字段清单漂移。
// 快照用于回溯整体还原战斗状态（含状态机实例 statusInstances——hidden/专注等刷新也要能回到快照时刻）。
import combatStore from './combatStore';
import battlegroundStore from './battlegroundStore';
import { globalStatusManager } from './statusManager';
import type { TurnSnapshot } from '@/types/combat';

export function buildTurnSnapshot(recordId: string): TurnSnapshot | null {
  const latest = combatStore.get(recordId);
  if (!latest) return null;
  const bg = battlegroundStore.get(recordId);
  return {
    combatants: latest.combatants.map(c => ({ ...c })),
    rounds: latest.rounds.map(r => ({ ...r })),
    roundsDm: (latest.roundsDm ?? []).map(r => ({ ...r })),
    battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
    zones: (bg?.zones ?? []).map(z => ({ ...z, cells: [...z.cells], hitRounds: { ...(z.hitRounds ?? {}) } })),
    equipmentChanges: latest.equipmentChanges
      ? Object.fromEntries(
          Object.entries(latest.equipmentChanges).map(([k, v]) => [
            k,
            { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
          ]),
        )
      : undefined,
    spellSlotChanges: latest.spellSlotChanges
      ? Object.fromEntries(Object.entries(latest.spellSlotChanges).map(([k, v]) => [k, { ...v }]))
      : undefined,
    featureUses: latest.featureUses
      ? Object.fromEntries(Object.entries(latest.featureUses).map(([k, v]) => [k, { ...v }]))
      : undefined,
    statusInstances: globalStatusManager.getActiveCombatInstances(recordId),
  };
}
