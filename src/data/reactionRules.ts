// 通用反应引擎：战斗事件抽象 + 注册式检测器（与 advantageRules 同构：纯只读检测，消费由调用方确认后执行）。
// 已接插桩：move（P1）、attack（P2 命中后/伤害前）、damage（P3 伤害结算前）、spell_cast（P3 施法确认前）。
// 借机攻击语义：移动者起点格在持有者任一近战武器触及内、落点格在触及外 → 打开机会。
// 攻击距离按「起点格」计算（离开触及的瞬时点），与 5e「借机攻击不阻止移动」一致。
// 近战判定与 CombatAttackModal.isRangedWeapon/isThrownWeapon 同口径（复制而非共享——
// 弹窗内的是闭包函数，抽公共模块的收益低于双份维护的漂移风险，改动时两处同步）。
import battlegroundStore from '@/data/battlegroundStore';
import { characterStore } from '@/data/characterStore';
import { getCombatRoundCtx } from '@/data/combatAffinities';
import { BUILTIN_OPPORTUNITY_ATTACK } from '@/data/reactionDefinitions';
import { spellStore } from '@/data/spellStore';
import { globalStatusManager } from '@/data/statusManager';
import type { CombatRecord, Combatant, ReactionPrompt, ReactionResolution, ReactionTrigger, NpcAttack } from '@/types/combat';
import type { Attack, Feature } from '@/types/character';
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
  // 怪物图鉴口径：提取器对近战也恒填 normalRange/maxRange，「normalRange>0 即远程」失效；
  // range 前缀「触及/射程」是解析链权威近远程标记（与 advantageRules/CombatAttackModal 副本同步维护）
  if (attack.range?.startsWith('触及')) return false;
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
  // 撤离（disengage）：持有者在状态存续期间的移动不引发借机攻击。
  // 仅抑制本检测器（离开触及）；enter_reach 哨兵类检测器不受影响。
  if (globalStatusManager
    .getActiveStatuses(moverId, 'combat', getCombatRoundCtx(record.id))
    .some(i => i.definitionId === 'disengaging')) return [];
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

/** 反应来源（法术/特性）统一视图：检测器只关心「何时触发、怎么解决」 */
interface ReactionSource {
  definitionId: string;
  definitionName: string;
  trigger: ReactionTrigger;
  resolution: ReactionResolution;
  scope?: 'self' | 'ally';
  slotLevel?: number;
  spellId?: string;
}

/** 参战者是否仍能行使反应（死亡/昏迷/失能均不能；no_reactions 状态 = 散打技巧封锁） */
function canReact(c: Combatant): boolean {
  if (c.isDead || c.isUnconscious || c.isIncapacitated) return false;
  if (globalStatusManager.getActiveStatuses(c.id, 'combat').some(i => i.definitionId === 'no_reactions')) return false;
  return true;
}

/** 特性反应候选：角色卡上带 reaction 声明且已达生效等级的特性 */
function getFeatureReactionSources(combatant: Combatant): ReactionSource[] {
  const character = combatant.characterId ? characterStore.get(combatant.characterId) : null;
  if (!character) return [];
  const level = characterStore.getEffectiveLevel(character);
  return (character.features || [])
    .filter(f => f.reaction?.trigger && (f.level == null || f.level <= level))
    .map(f => ({
      definitionId: `feature:${f.name}`,
      definitionName: f.name,
      trigger: f.reaction!.trigger,
      resolution: f.reaction!.resolution ?? 'spell',
      scope: f.reaction!.scope,
      slotLevel: f.reaction!.slotLevel,
    }));
}

/**
 * 法术反应候选（数据驱动）：参战者已知法术中带 reaction 声明者。
 * 试验场开放全库（便于测试受术方反应）；普通战斗只取角色卡习得列表，按名字回查法术库。
 * 纯只读，不校验反应次数/法术位（可用性由弹窗二次校验，避免检测阶段丢信息）。
 */
function getSpellReactionSources(record: CombatRecord, combatant: Combatant): ReactionSource[] {
  if (!combatant.characterId && !record.isProvingGround) return [];
  const character = combatant.characterId ? characterStore.get(combatant.characterId) : null;
  if (!character && !record.isProvingGround) return [];
  const all = spellStore.getAll().filter(s => !!s.reaction?.trigger);
  const known = record.isProvingGround
    ? all
    : (() => {
        const names = new Set([...(character?.spells?.cantrips ?? []), ...(character?.spells?.custom ?? [])]);
        return all.filter(s => names.has(s.name));
      })();
  return known.map(spell => ({
    definitionId: `spell:${spell.id}`,
    definitionName: spell.name,
    trigger: spell.reaction!.trigger,
    resolution: spell.reaction!.resolution ?? 'spell',
    scope: spell.reaction!.scope,
    slotLevel: spell.reaction!.slotLevel,
    spellId: spell.id,
  }));
}

/** 合并法术与特性来源，按 definitionId 去重（同一条声明只出一个机会） */
function getOwnerReactionSources(record: CombatRecord, owner: Combatant): ReactionSource[] {
  const seen = new Set<string>();
  const out: ReactionSource[] = [];
  for (const src of [...getSpellReactionSources(record, owner), ...getFeatureReactionSources(owner)]) {
    if (seen.has(src.definitionId)) continue;
    seen.add(src.definitionId);
    out.push(src);
  }
  return out;
}

/** self = 事件目标本人；ally = 同阵营（不含本人） */
function matchesSelfOrAlly(owner: Combatant, target: Combatant, scope?: 'self' | 'ally'): boolean {
  if ((scope ?? 'self') === 'self') return owner.id === target.id;
  return owner.id !== target.id && !!owner.isPc === !!target.isPc;
}

/** 攻击目标触发的反应检测器（attack_targeted）：被攻击者本人 / 其同阵营者按声明产出 */
registerReactionDetector((record, event) => {
  if (event.kind !== 'attack') return [];
  const attacker = record.combatants.find(c => c.id === event.attackerId);
  const target = record.combatants.find(c => c.id === event.targetId);
  if (!attacker || !target) return [];
  if (target.isDead || target.isUnconscious) return [];
  const results: ReactionMatch[] = [];
  for (const owner of record.combatants) {
    if (!canReact(owner)) continue;
    if (owner.id === attacker.id) continue;
    // 必须与攻击方敌对（同阵营不反应）
    if (!!owner.isPc === !!attacker.isPc) continue;
    for (const src of getOwnerReactionSources(record, owner)) {
      // attack_targeted：被攻击者本人（scope=self）或其同阵营者（scope=ally，如护盾术式守护）
      // ally_attacked：盟友被攻击（守护反击类，如哨兵），固定 scope=ally 语义
      const triggerOk =
        src.trigger === 'attack_targeted' ||
        (src.trigger === 'ally_attacked' && (src.scope ?? 'self') === 'ally');
      if (!triggerOk) continue;
      if (!matchesSelfOrAlly(owner, target, src.scope)) continue;
      results.push({
        ownerId: owner.id,
        definitionId: src.definitionId,
        definitionName: src.definitionName,
        trigger: src.trigger,
        attackerId: attacker.id,
        targetId: target.id,
        spellId: src.spellId,
      });
    }
  }
  return results;
});

/** 进入触及检测器（enter_reach）：移动者落点进入持有者近战触及、起点在触及外（哨兵类反应） */
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
    if (owner.id === moverId || !canReact(owner)) continue;
    if (!!owner.isPc === !!mover.isPc) continue;
    const sources = getOwnerReactionSources(record, owner).filter(s => s.trigger === 'enter_reach');
    if (sources.length === 0) continue;
    const pos = ownerPosOf(owner.id);
    if (!pos) continue;
    const attacks = getMeleeAttacks(record, owner);
    if (attacks.length === 0) continue;
    const reach = Math.max(...attacks.map(a => getMeleeReachCells(a) ?? 0));
    if (reach <= 0) continue;
    if (chebyshev(fromPos, pos) > reach && chebyshev(toPos, pos) <= reach) {
      for (const src of sources) {
        results.push({
          ownerId: owner.id,
          definitionId: src.definitionId,
          definitionName: src.definitionName,
          trigger: 'enter_reach',
          moverId,
          fromPos,
          toPos,
          eventLabel: '移动者进入你的触及范围',
        });
      }
    }
  }
  return results;
});

/** 受到伤害检测器（damage_taken）：伤害结算前，目标本人 / 其同阵营者按声明产出 */
registerReactionDetector((record, event) => {
  if (event.kind !== 'damage') return [];
  const target = record.combatants.find(c => c.id === event.targetId);
  if (!target || target.isDead || target.isUnconscious) return [];
  const results: ReactionMatch[] = [];
  for (const owner of record.combatants) {
    if (!canReact(owner)) continue;
    for (const src of getOwnerReactionSources(record, owner)) {
      if (src.trigger !== 'damage_taken') continue;
      if (!matchesSelfOrAlly(owner, target, src.scope)) continue;
      results.push({
        ownerId: owner.id,
        definitionId: src.definitionId,
        definitionName: src.definitionName,
        trigger: 'damage_taken',
        attackerId: event.attackerId,
        targetId: target.id,
        amount: event.amount,
        damageType: event.damageType,
        spellId: src.spellId,
        eventLabel: `受到 ${event.amount} 点${event.damageType || ''}伤害`,
      });
    }
  }
  return results;
});

/** 他人施法检测器（spell_cast）：施法确认前，敌对持有者按声明产出（法术反制类） */
registerReactionDetector((record, event) => {
  if (event.kind !== 'spell_cast') return [];
  const caster = record.combatants.find(c => c.id === event.casterId);
  if (!caster || caster.isDead) return [];
  const spellName = spellStore.getById(event.spellId)?.name ?? event.spellId;
  const results: ReactionMatch[] = [];
  for (const owner of record.combatants) {
    if (owner.id === caster.id || !canReact(owner)) continue;
    for (const src of getOwnerReactionSources(record, owner)) {
      if (src.trigger !== 'spell_cast') continue;
      // scope=ally：保护同阵营施法者；缺省 self：对敌对施法者反应（反制）
      if (src.scope === 'ally') {
        if (!!owner.isPc !== !!caster.isPc) continue;
      } else if (!!owner.isPc === !!caster.isPc) {
        continue;
      }
      results.push({
        ownerId: owner.id,
        definitionId: src.definitionId,
        definitionName: src.definitionName,
        trigger: 'spell_cast',
        casterId: caster.id,
        targetId: caster.id,
        spellId: event.spellId,
        eventLabel: `施放《${spellName}》`,
      });
    }
  }
  return results;
});
