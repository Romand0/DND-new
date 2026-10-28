// 沙盘地形区域的规则计算（纯函数，无副作用）
// 规则基线：《玩家手册 2014》油瓶 —— 进入区域或在区域内结束回合时受到伤害，
// 同一生物每回合只受一次；区域按回合数到期自动移除。
import { resolveDamage } from '@/data/damageRules';
import { getCombatantAffinities } from '@/data/combatAffinities';
import type { BattlegroundZone, TokenPosition } from '@/types/battleground';
import type { Combatant } from '@/types/combat';
import type { DamageResolution } from '@/types/damage';

export interface ZoneDamageEvent {
  combatantId: string;
  combatantName: string;
  zoneId: string;
  zoneLabel: string;
  /** 抗性结算前的伤害量 */
  baseAmount: number;
  /** 抗性/易伤/免疫结算后的最终伤害量 */
  amount: number;
  damageType: string;
  magical: boolean;
  resolution: DamageResolution | null;
  /** 触发时机：进入区域 / 回合结束 */
  trigger: 'enter' | 'end_turn';
}

/** 该格子所属区域（支持多区域叠加，按创建顺序返回） */
export function getZonesAtCell(zones: BattlegroundZone[] | undefined, col: number, row: number): BattlegroundZone[] {
  if (!zones || zones.length === 0) return [];
  const key = `${col},${row}`;
  return zones.filter((z) => z.cells.includes(key));
}

/** 区域在本回合是否生效 */
function isZoneActiveAt(zone: BattlegroundZone, round: number): boolean {
  if (typeof zone.expireRound === 'number' && zone.expireRound < round) return false;
  if (typeof zone.createdRound === 'number' && zone.createdRound > round) return false;
  return true;
}

/** 该生物本回合是否已在更早的时机受过这个区域的伤害 */
function alreadyHitThisRound(zone: BattlegroundZone, combatantId: string, round: number): boolean {
  // 模拟模式（round=0 且区域无回合生命）没有回合概念，每次移动都允许触发
  if (round <= 0 && typeof zone.expireRound !== 'number') return false;
  return zone.hitRounds?.[combatantId] === round;
}

/**
 * 计算某生物在指定格子、指定回合受到的区域伤害。
 * 返回 null 表示无伤害（不在区域 / 区域失效 / 本回合已受过该区域伤害 / 无伤害配置）。
 */
export function computeZoneDamage(
  zones: BattlegroundZone[] | undefined,
  combatant: Combatant | null | undefined,
  pos: { col: number; row: number } | null | undefined,
  round: number,
  trigger: 'enter' | 'end_turn',
  recordId?: string,
): ZoneDamageEvent | null {
  if (!combatant || !pos) return null;
  if (combatant.isDead) return null;
  const here = getZonesAtCell(zones, pos.col, pos.row).filter(
    (z) => z.damage && z.damage.amount > 0 && isZoneActiveAt(z, round),
  );
  if (here.length === 0) return null;
  // 同回合多区域叠加时只结算第一个（同一生物每回合只受该伤害作用一次）
  const zone = here.find((z) => !alreadyHitThisRound(z, combatant.id, round));
  if (!zone || !zone.damage) return null;

  const affinities = getCombatantAffinities(combatant, recordId);
  const resolution = resolveDamage(
    [{ type: zone.damage.damageType, amount: zone.damage.amount }],
    affinities,
    { kind: 'effect', magical: zone.damage.magical === true },
  );

  return {
    combatantId: combatant.id,
    combatantName: combatant.name,
    zoneId: zone.id,
    zoneLabel: zone.label,
    baseAmount: zone.damage.amount,
    amount: resolution.final,
    damageType: zone.damage.damageType,
    magical: zone.damage.magical === true,
    resolution,
    trigger,
  };
}

/** 标记某生物本回合已受该区域伤害（避免同一回合重复触发） */
export function withHitMark(zone: BattlegroundZone, combatantId: string, round: number): BattlegroundZone {
  return { ...zone, hitRounds: { ...(zone.hitRounds ?? {}), [combatantId]: round } };
}

/** 该参战者当前所在格子（沙盘 tokens） */
export function findTokenPos(tokens: TokenPosition[] | undefined, combatantId: string): { col: number; row: number } | null {
  const t = (tokens ?? []).find((x) => x.combatantId === combatantId);
  return t ? { col: t.col, row: t.row } : null;
}
