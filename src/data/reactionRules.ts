// 通用反应引擎：战斗事件抽象 + 注册式检测器（与 advantageRules 同构：纯只读检测，消费由调用方确认后执行）。
// 已接插桩：move（P1）、attack（P2 命中后/伤害前）；damage / spell_cast 事件类型已定好，
// 检测器与插桩点留待 P3（避免后续改签名）。
// 借机攻击语义：移动者起点格在持有者任一近战武器触及内、落点格在触及外 → 打开机会。
// 攻击距离按「起点格」计算（离开触及的瞬时点），与 5e「借机攻击不阻止移动」一致。
// 近战判定与 CombatAttackModal.isRangedWeapon/isThrownWeapon 同口径（复制而非共享——
// 弹窗内的是闭包函数，抽公共模块的收益低于双份维护的漂移风险，改动时两处同步）。
import battlegroundStore from '@/data/battlegroundStore';
import { characterStore } from '@/data/characterStore';
import { BUILTIN_OPPORTUNITY_ATTACK } from '@/data/reactionDefinitions';
import { spellStore } from '@/data/spellStore';
import type { CombatRecord, Combatant, ReactionPrompt, NpcAttack } from '@/types/combat';
import type { Attack } from '@/types/character';
import type { Spell } from '@/types/spell';

type AnyAttack = Attack | NpcAttack;

/** 位置格（切比雪夫网格坐标） */
export interface GridPos {
  col: number;
  row: number;
}

/**
 * 战斗事件（反应触发面）：
 * - move：移动完成时（DM 直操落子 / 玩家回合包 move op 落库）
 * - attack：攻击被确认指定（P2 护盾术窗口：命中判定后、伤害结算前）
 * - damage：伤害即将落地（P2 减伤/反击窗口）
 * - spell_cast：法术施放完成前（P2 法术反制窗口）
 */
export type ReactionCombatEvent =
  | { kind: 'move'; moverId: string; from: GridPos; to: GridPos; source: 'dm_drag' | 'turn_commit' }
  | { kind: 'attack'; attackerId: string; targetId: string }
  | { kind: 'damage'; targetId: string; attackerId?: string; amount: number; damageType: string }
  | { kind: 'spell_cast'; casterId: string; spellId: string };

/** 检测产出的候选（id/round/consumed 由 store 写入时补齐） */
export type ReactionMatch = Omit<ReactionPrompt, 'id' | 'round' | 'consumed'>;

/** 检测器：纯函数，读事件 + 记录；返回所有命中的候选（可含多个持有者） */
export type ReactionDetector = (record: CombatRecord, event: ReactionCombatEvent) => ReactionMatch[];

const detectors: ReactionDetector[] = [];

export function registerReactionDetector(fn: ReactionDetector): void {
  detectors.push(fn);
}

/** 引擎入口：执行全部已注册检测器并合并结果（只读，不修改任何状态） */
export function detectReactions(record: CombatRecord, event: ReactionCombatEvent): ReactionMatch[] {
  const out: ReactionMatch[] = [];
  for (const fn of detectors) {
    try {
      out.push(...fn(record, event));
    } catch (err) {
      // 单个检测器异常不拖垮整条触发链（反应失败不应阻断移动/攻击落库）
      console.error('[reactionRules] detector failed', err);
    }
  }
  return out;
}


/** 纯远程武器判定（同 CombatAttackModal.isRangedWeapon） */
function isRangedWeapon(attack: AnyAttack): boolean {
  if (attack.subtype) {
    if (attack.subtype.includes('远程') || attack.subtype.includes('弹药')) return true;
  }
  if (attack.normalRange !== undefined && attack.normalRange > 0) return true;
  if (attack.maxRange !== undefined && attack.maxRange > 0) return true;
  return false;
}

/** 投掷武器判定（同 CombatAttackModal.isThrownWeapon）：投掷武器可近战使用 */
function isThrownWeapon(attack: AnyAttack): boolean {
  if (attack.properties && attack.properties.some(p => p.includes('弹药'))) return false;
  if (attack.subtype && attack.subtype.includes('弹药')) return false;
  if (attack.subtype && attack.subtype.includes('投掷')) return true;
  if (attack.properties) {
    return attack.properties.some(p => p.includes('投掷'));
  }
  return false;
}

/**
 * 近战触及格数（1 格 = 5 尺）。
 * range 字段（如「5尺」「10尺」）解析数字；解析失败按 5 尺（1 格）兜底。
 * 返回 null = 无近战使用方式（纯远程武器，无借机攻击资格）。
 */
export function getMeleeReachCells(attack: AnyAttack): number | null {
  if (isRangedWeapon(attack) && !isThrownWeapon(attack)) return null;
  const m = /(\d+)/.exec(attack.range ?? '');
  const feet = m ? parseInt(m[1], 10) : 5;
  if (!Number.isFinite(feet) || feet <= 0) return null;
  return Math.max(1, Math.ceil(feet / 5));
}

/**
 * 参战者的近战攻击集（借机攻击可用攻击）。
 * PC：角色卡 attacks（含徒手击打兜底）；NPC/影子参战者：自带 attacks。
 * 攻击列表来源与 CombatAttackModal 同口径：角色卡有条目用角色卡，否则参战者自带。
 */
export function getMeleeAttacks(record: CombatRecord, combatant: Combatant): AnyAttack[] {
  const character = combatant.isPc && combatant.characterId ? characterStore.get(combatant.characterId) : null;
  const list: AnyAttack[] =
    character?.attacks && character.attacks.length > 0 ? character.attacks : combatant.attacks || [];
  const melee = list.filter(a => getMeleeReachCells(a) !== null);
  // PC 徒手兜底：无任何近战条目时仍有徒手击打（5e 任何生物可徒手借机）
  if (melee.length === 0 && combatant.isPc) {
    const unarmed = list.find(a => a.name === '徒手击打');
    if (unarmed) return [unarmed];
    return [{ name: '徒手击打', attackBonus: '0', damage: '1+0', damageType: '钝击', range: '5尺', properties: [] } as unknown as NpcAttack];
  }
  return melee;
}

function chebyshev(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/**
 * 借机攻击检测器（move 事件）：移动者 fromPos → toPos，遍历敌方参战者，
 * 起点 ≤ 任一近战触及 且 落点 > 同一触及（用该 owner 的最大触及格数判定跨界）。
 * 死亡/昏迷/失能/反应已用的持有者仍生成机会（弹窗内显示反应已用尽，由 DM 放弃）——
 * 5e 语义：机会窗口客观存在，能否行使取决于反应可用性。
 */
registerReactionDetector((record, event) => {
  if (event.kind !== 'move') return [];
  const { moverId, from: fromPos, to: toPos } = event;
  const mover = record.combatants.find(c => c.id === moverId);
  if (!mover || mover.isDead || mover.isUnconscious) return [];
  const bg = battlegroundStore.get(record.id);
  const tokens = bg?.tokens ?? [];
  const ownerPosOf = (id: string) => {
    const t = tokens.find(x => x.combatantId === id);
    return t ? { col: t.col, row: t.row } : null;
  };

  const results: ReactionMatch[] = [];
  for (const owner of record.combatants) {
    if (owner.id === moverId) continue;
    // 敌对阵营：isPc 不同（PC/NPC 两阵营；同侧不借机）
    if (!!owner.isPc === !!mover.isPc) continue;
    if (owner.isDead) continue;
    const pos = ownerPosOf(owner.id);
    if (!pos) continue;
    const attacks = getMeleeAttacks(record, owner);
    if (attacks.length === 0) continue;
    const reach = Math.max(...attacks.map(a => getMeleeReachCells(a) ?? 0));
    if (reach <= 0) continue;
    if (chebyshev(fromPos, pos) <= reach && chebyshev(toPos, pos) > reach) {
      results.push({
        ownerId: owner.id,
        definitionId: BUILTIN_OPPORTUNITY_ATTACK,
        trigger: 'move_leave_reach',
        moverId,
        fromPos,
        toPos,
      });
    }
  }
  return results;
});

/**
 * 法术反应候选（数据驱动）：参战者已知法术中带 reaction 声明者。
 * 试验场开放全库（便于测试受术方反应）；普通战斗只取角色卡习得列表，按名字回查法术库。
 * 纯只读，不校验反应次数/法术位（可用性由弹窗二次校验，避免检测阶段丢信息）。
 */
function getKnownReactionSpells(record: CombatRecord, combatant: Combatant): Spell[] {
  if (!combatant.characterId && !record.isProvingGround) return [];
  const character = combatant.characterId ? characterStore.get(combatant.characterId) : null;
  if (!character && !record.isProvingGround) return [];
  const all = spellStore.getAll().filter(s => !!s.reaction?.trigger);
  if (record.isProvingGround) return all;
  const names = new Set([...(character?.spells?.cantrips ?? []), ...(character?.spells?.custom ?? [])]);
  return all.filter(s => names.has(s.name));
}

/** 攻击目标触发的反应检测器（attack_targeted）：被攻击者本人 / 其同阵营者按法术声明产出 */
registerReactionDetector((record, event) => {
  if (event.kind !== 'attack') return [];
  const attacker = record.combatants.find(c => c.id === event.attackerId);
  const target = record.combatants.find(c => c.id === event.targetId);
  if (!attacker || !target) return [];
  if (target.isDead || target.isUnconscious) return [];
  const results: ReactionMatch[] = [];
  for (const owner of record.combatants) {
    if (owner.isDead || owner.isUnconscious || owner.isIncapacitated) continue;
    if (owner.id === attacker.id) continue;
    // 必须与攻击方敌对（同阵营不反应）
    if (!!owner.isPc === !!attacker.isPc) continue;
    for (const spell of getKnownReactionSpells(record, owner)) {
      const rx = spell.reaction!;
      if (rx.trigger !== 'attack_targeted') continue;
      const scope = rx.scope ?? 'self';
      if (scope === 'self' && owner.id !== target.id) continue;
      if (scope === 'ally') {
        if (!!owner.isPc !== !!target.isPc) continue;
        if (owner.id === target.id) continue;
      }
      results.push({
        ownerId: owner.id,
        definitionId: `spell:${spell.id}`,
        definitionName: spell.name,
        trigger: 'attack_targeted',
        attackerId: attacker.id,
        targetId: target.id,
        spellId: spell.id,
      });
    }
  }
  return results;
});
