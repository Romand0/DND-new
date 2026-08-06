import type { Combatant } from '@/types/combat';
import type { NpcAttack } from '@/types/combat';
import type { Attack, Equipment } from '@/types/character';
import type { ItemToken } from '@/types/battleground';
import { characterStore } from '@/data/characterStore';
import battlegroundStore from '@/data/battlegroundStore';
import {
  applyEquipmentChange,
  getCombatInventoryRaw,
} from '@/data/combatStore';
import combatStore from '@/data/combatStore';

export function chebyDist(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/**
 * 计算投掷武器掉落位置
 * hit=true: 敌人 5 尺（1 格）内最靠近玩家的 3 格中随机一格
 * hit=false: 以玩家为圆心、本次射程为半径 和 以敌人为圆心、敌人速度为半径 的交集区域随机一格
 */
export function calcThrownDropPos(
  attackerPos: { col: number; row: number },
  targetPos: { col: number; row: number },
  hit: boolean,
  rangeUsedFeet: number,
  targetSpeed: number,
  gridCols: number,
  gridRows: number,
): { col: number; row: number } {
  if (hit) {
    const candidates: { col: number; row: number; d: number }[] = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const c = targetPos.col + dc;
        const r = targetPos.row + dr;
        if (c < 0 || c >= gridCols || r < 0 || r >= gridRows) continue;
        candidates.push({
          col: c,
          row: r,
          d: chebyDist({ col: c, row: r }, attackerPos),
        });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    const top = candidates.slice(0, Math.min(3, candidates.length));
    if (top.length === 0) return { col: targetPos.col, row: targetPos.row };
    return top[Math.floor(Math.random() * top.length)];
  }
  const rangeCells = Math.floor(rangeUsedFeet / 5);
  const speedCells = Math.floor(targetSpeed / 5);
  const candidates: { col: number; row: number }[] = [];
  for (let c = 0; c < gridCols; c++) {
    for (let r = 0; r < gridRows; r++) {
      const dPlayer = chebyDist({ col: c, row: r }, attackerPos);
      const dEnemy = chebyDist({ col: c, row: r }, targetPos);
      if (dPlayer <= rangeCells && dEnemy <= speedCells) {
        candidates.push({ col: c, row: r });
      }
    }
  }
  if (candidates.length === 0) {
    return {
      col: Math.round((attackerPos.col + targetPos.col) / 2),
      row: Math.round((attackerPos.row + targetPos.row) / 2),
    };
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function useThrownDrop(recordId: string | null) {
  /**
   * 执行投掷武器掉落：从攻击者背包移除武器，在网格上生成物品 token
   * @returns 掉落的 token 数据，若没触发掉落则返回 null
   */
  const executeThrownDrop = (
    attacker: Combatant,
    target: Combatant,
    attack: Attack | NpcAttack,
    attackerPos: { col: number; row: number },
    targetPos: { col: number; row: number },
    hit: boolean,
    record: any,
    usageMode?: 'melee' | 'thrown',
  ): ItemToken | null => {
    if (usageMode !== 'thrown') return null;
    if (!recordId || !record) return null;
    const bg = battlegroundStore.get(recordId);
    if (!bg) return null;

    let rangeUsedFeet = attack.normalRange || 20;
    const distanceFeet = chebyDist(attackerPos, targetPos) * 5;
    if (attack.maxRange && distanceFeet > (attack.normalRange || 0)) {
      rangeUsedFeet = attack.maxRange;
    }
    const targetSpeed = target.speed || 30;

    const gridCols = bg.size === 'small' ? 12 : bg.size === 'medium' ? 24 : 36;
    const gridRows = bg.size === 'small' ? 18 : bg.size === 'medium' ? 36 : 54;

    const dropPos = calcThrownDropPos(
      attackerPos,
      targetPos,
      hit,
      rangeUsedFeet,
      targetSpeed,
      gridCols,
      gridRows,
    );

    let equipData: Record<string, unknown> = {
      name: attack.name,
      category: '武器',
      subtype: attack.subtype,
      damageDice: attack.damage,
      damageType: attack.damageType,
      properties: attack.properties,
      normalRange: attack.normalRange,
      maxRange: attack.maxRange,
      range: attack.range,
      quantity: 1,
    };

    if (attacker.characterId) {
      const combatInventoryRaw = getCombatInventoryRaw(record, attacker);
      const char = characterStore.get(attacker.characterId);
      const heldLeftId = char?.heldLeft?.equipmentId;
      const heldRightId = char?.heldRight?.equipmentId;
      let foundEquip: Equipment | null = null;
      for (const eq of combatInventoryRaw) {
        const slotId = eq.childId || eq.id;
        if (slotId === heldLeftId || slotId === heldRightId) {
          if (eq.name === attack.name) {
            foundEquip = eq;
            break;
          }
        }
      }
      if (!foundEquip) {
        foundEquip = combatInventoryRaw.find(e => e.name === attack.name) || null;
      }
      if (foundEquip) {
        equipData = { ...(foundEquip as any), quantity: 1 };
        const slotId = foundEquip.childId || foundEquip.id || '';
        const qty = (foundEquip.quantity || 1);
        const currentChanges = record?.equipmentChanges?.[attacker.id];
        const newChanges = applyEquipmentChange(currentChanges, (ch) => {
          if (qty > 1) {
            ch.quantityDeltas[slotId] = (ch.quantityDeltas[slotId] || 0) - 1;
          } else {
            if (!ch.removedChildIds.includes(slotId)) {
              ch.removedChildIds.push(slotId);
            }
          }
        });
        combatStore.update(record.id, {
          equipmentChanges: {
            ...(record?.equipmentChanges || {}),
            [attacker.id]: newChanges,
          },
        });
      }
    }

    const tokenId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const itemToken: ItemToken = {
      id: tokenId,
      col: dropPos.col,
      row: dropPos.row,
      name: attack.name,
      equipmentData: equipData,
      droppedBy: attacker.id,
    };
    battlegroundStore.placeItemToken(recordId, itemToken);
    return itemToken;
  };

  return { executeThrownDrop, calcThrownDropPos, chebyDist };
}
