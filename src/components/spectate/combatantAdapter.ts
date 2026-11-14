// 观战投影 → DM 侧战斗组件所需的 Combatant/Equipment 形状适配层。
// 玩家端复用 CombatAttackModal / CombatDamageModal / CombatSpellModal 时，这些组件只认
// Combatant + Equipment[]（DM 内部数据模型），而玩家端只有脱敏投影 CombatRosterEntry。
// 本模块把投影映射成同形状对象，保证弹窗内的手持/射程/弹药判定逻辑与 DM 端完全同源。
import { calcAttackBonus } from '@/lib/attackBonus';
import type { Character, Attack, Equipment, HandSlot } from '@/types/character';
import type { Combatant } from '@/types/combat';
import type { CombatRosterEntry, RosterInventoryItem } from '@/types/realtime';

/** 投影背包条目 → DM 侧 Equipment 形状（弹窗手部/弹药查找按 childId/id 匹配） */
export function rosterItemToEquipment(item: RosterInventoryItem): Equipment {
  const atk = item.attack;
  return {
    id: item.childId,
    childId: item.childId,
    name: item.name,
    quantity: item.quantity,
    category: item.category ?? (atk ? '武器' : '杂项'),
    magicBonus: item.magicBonus,
    properties: atk?.properties,
    subtype: atk?.subtype,
    damageDice: atk?.damage,
    damageType: atk?.damageType,
    normalRange: atk?.normalRange,
    maxRange: atk?.maxRange,
    twoHandedDamage: atk?.twoHandedDamage,
  } as Equipment;
}

/** 投影背包 → DM 侧战斗背包（Equipment[]），供弹窗的手持/弹药判定读取 */
export function rosterInventoryToEquipmentList(entry: CombatRosterEntry): Equipment[] {
  return (entry.inventory ?? []).map(rosterItemToEquipment);
}

/** 投影手持名称 → 背包实例 childId（投影只带武器名，按名匹配；重名取首件） */
function resolveHeldChildId(entry: CombatRosterEntry, name?: string | null): string | null {
  if (!name) return null;
  return (entry.inventory ?? []).find((i) => i.name === name)?.childId ?? null;
}

function heldSlot(entry: CombatRosterEntry, side: 'left' | 'right'): HandSlot | undefined {
  const info = side === 'left' ? entry.heldLeft : entry.heldRight;
  if (!info) return undefined;
  return {
    equipmentId: resolveHeldChildId(entry, info.name),
    state: info.state === 'action' || info.state === 'unavailable' ? info.state : 'ready',
  };
}

/** 投影武器快照 → Attack（攻击加值按本人角色卡自动计算，角色卡未就绪时退回魔法加值） */
export function buildRosterAttacks(entry: CombatRosterEntry, character: Character | null): Attack[] {
  return (entry.inventory ?? [])
    .filter((i): i is RosterInventoryItem & { attack: NonNullable<RosterInventoryItem['attack']> } => !!i.attack)
    .map((item) => {
      const atk = item.attack;
      const bonus = character
        ? calcAttackBonus(
            { name: item.name, subtype: atk.subtype, properties: atk.properties, magicBonus: item.magicBonus },
            character
          ).bonus
        : (item.magicBonus ?? 0);
      return {
        id: item.childId,
        name: item.name,
        attackBonus: bonus >= 0 ? `+${bonus}` : `${bonus}`,
        damage: atk.damage,
        damageType: atk.damageType,
        range: '',
        properties: atk.properties ?? [],
        subtype: atk.subtype,
        normalRange: atk.normalRange,
        maxRange: atk.maxRange,
        twoHandedDamage: atk.twoHandedDamage,
        loaded: atk.loaded,
      } as Attack;
    });
}

/** 投影参战者 → DM 侧 Combatant 形状（字段一一映射，缺省字段留给弹窗的兜底逻辑） */
export function rosterEntryToCombatant(entry: CombatRosterEntry, character: Character | null): Combatant {
  return {
    id: entry.id,
    name: entry.name,
    initiative: entry.initiative,
    ac: entry.ac ?? undefined,
    maxHp: entry.maxHp,
    currentHp: entry.hp,
    tempHp: entry.tempHp,
    isDead: entry.dead,
    isUnconscious: entry.downed,
    isIncapacitated: entry.incapacitated,
    concentration: entry.concentration
      ? { spellName: entry.concentration.spellName, startedRound: entry.concentration.startedRound }
      : undefined,
    deathSaveFailures: entry.deathSaves?.failures,
    deathSaveSuccesses: entry.deathSaves?.successes,
    heldLeft: heldSlot(entry, 'left'),
    heldRight: heldSlot(entry, 'right'),
    isPc: entry.isPc,
    characterId: entry.characterId ?? undefined,
    actions: entry.actions,
    bonusActions: entry.bonusActions,
    attacks: buildRosterAttacks(entry, character),
  };
}
