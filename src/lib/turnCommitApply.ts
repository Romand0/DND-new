// 玩家回合提交落库：把 TurnCommitOp[] 应用到 CombatRecord（DM 端调用）。
// 纯函数 + 显式 deps：伤害/动作消耗/推进回合复用 CombatSession 已挂的 hook 能力，
// 弹药与先攻表格文本直接走 combatStore。校验失败返回 { ok:false, reason }，
// 由调用方通过回执广播给玩家。
import combatStore, { computeChildQtyMap, getCombatInventory } from '@/data/combatStore';
import battlegroundStore from '@/data/battlegroundStore';
import { characterStore } from '@/data/characterStore';
import type { SpellSlotLevel } from '@/types/character';
import type { CombatRecord, ReactionOpportunity } from '@/types/combat';
import { detectOpportunityAttacks } from '@/data/reactionRules';
import type { DamageApplication, DamageApplyResult } from '@/types/damage';
import type { PlayerActionRequest } from '@/types/realtime';

export interface TurnCommitApplyDeps {
  record: CombatRecord;
  request: PlayerActionRequest;
  /** DM 端当前放映轮次（1-based，与 request.round 同语义）；不一致则拒绝 */
  currentRound: number;
  applyDamage: (event: DamageApplication) => DamageApplyResult | null;
  consumeAction: (combatantId: string) => void;
  consumeBonusAction: (combatantId: string) => void;
  advanceTurn: () => void;
  /** 专注类法术施放成功后进入专注状态（CombatSession 侧能力，传 id/spellName 即可） */
  beginConcentration?: (combatantId: string, spellName: string) => void;
}

export type TurnCommitApplyResult = { ok: true; reactions?: ReactionOpportunity[] } | { ok: false; reason: string };

/** 弹药扣减：剩余发数足够走 quantityDeltas，扣到最后一发整件移除（与 DM 端攻击链一致） */
function consumeAmmo(record: CombatRecord, combatantId: string, ammoChildId: string, count: number) {
  const changes = record.equipmentChanges?.[combatantId] ?? { added: [], removedChildIds: [], quantityDeltas: {} };
  const actor = record.combatants.find((c) => c.id === combatantId);
  const character = actor?.characterId ? characterStore.get(actor.characterId) : null;
  const qtyMap = computeChildQtyMap(character, changes);
  const remaining = qtyMap.get(ammoChildId)?.combatQty ?? 0;
  if (count >= remaining) {
    changes.removedChildIds = [...(changes.removedChildIds ?? []), ammoChildId];
  } else {
    changes.quantityDeltas = { ...(changes.quantityDeltas ?? {}), [ammoChildId]: (changes.quantityDeltas?.[ammoChildId] ?? 0) - count };
  }
  return changes;
}

export function applyTurnCommit(deps: TurnCommitApplyDeps): TurnCommitApplyResult {
  const { record, request, currentRound, applyDamage, consumeAction, consumeBonusAction, advanceTurn, beginConcentration } = deps;
  const actor = record.combatants.find((c) => c.id === request.combatantId);
  if (!actor) return { ok: false, reason: '参战者不存在或已被移除' };
  if (!actor.isPc) return { ok: false, reason: '仅玩家角色（PC）可由玩家端操作' };
  if (request.round !== currentRound) {
    return { ok: false, reason: `回合已推进（提交时第 ${request.round} 轮，当前第 ${currentRound} 轮），请重新确认后提交` };
  }

  const ops = request.action?.ops ?? [];
  const appliedChanges: Record<string, NonNullable<CombatRecord['equipmentChanges'][string]>> = {};
  const appliedDamages: string[] = [];
  const collectedReactions: ReactionOpportunity[] = [];
  let consumedAction = false;
  let consumedBonus = false;
  let endTurn = false;

  for (const op of ops) {
    if (op.kind === 'attack') {
      if (op.ammoChildId && (op.ammoCount ?? 0) > 0) {
        appliedChanges[actor.id] = consumeAmmo(record, actor.id, op.ammoChildId, op.ammoCount!);
      }
      combatStore.pushCombatEvent(record.id, {
        kind: 'attack',
        round: request.round,
        actorId: actor.id,
        targetId: op.targetId,
        ranged: op.ranged === true,
        hit: op.hit,
        critical: op.critical,
        weaponName: op.weaponName,
        text: op.roundText,
      });
      if (op.hit && op.damage && op.damage.amount > 0) {
        const result = applyDamage({
          targetId: op.targetId,
          amount: op.damage.amount,
          sourceId: actor.id,
          sourceName: actor.name,
          damageType: op.damage.type,
        });
        if (result) appliedDamages.push(`${op.targetName} -${result.damage}`);
      }
      // 同一回合多次攻击只扣一次主动作（额外攻击规则由 DM 桌面把握）
      if (!consumedAction) {
        consumeAction(actor.id);
        consumedAction = true;
      }
    } else if (op.kind === 'move') {
      // placeToken 内含越界保护与目标格挤占；玩家端拖拽已限自身棋子
      const fromToken = battlegroundStore.get(record.id)?.tokens.find(t => t.combatantId === actor.id);
      const fromPos = fromToken ? { col: fromToken.col, row: fromToken.row } : null;
      battlegroundStore.placeToken(record.id, { combatantId: actor.id, col: op.to.col, row: op.to.row });
      // 借机攻击判定（5e：移动者离开触及范围的瞬时窗口）：
      // 机会持久化在持有者身上（pendingReactions），由调用方弹窗处理；
      // 打包提交语义下后续 ops 先落库，不回滚（借机攻击不阻止移动，时间线以记录顺序近似）
      if (fromPos) {
        const opps = detectOpportunityAttacks(record, actor.id, fromPos, op.to);
        if (opps.length > 0) {
          for (const o of opps) {
            const fulls = combatStore.addPendingReactions(record.id, o.ownerId, [o], request.round);
            collectedReactions.push(...fulls);
          }
        }
      }
      combatStore.pushCombatEvent(record.id, {
        kind: 'move',
        round: request.round,
        actorId: actor.id,
        to: { col: op.to.col, row: op.to.row },
        text: op.roundText,
      });
    } else if (op.kind === 'cast') {
      if (op.slotLevel > 0) {
        const levelKey = `level${op.slotLevel}` as SpellSlotLevel;
        if (!combatStore.consumeSpellSlot(record.id, actor.id, levelKey)) {
          return { ok: false, reason: `${op.spellName} 需要 ${op.slotLevel} 环法术位，但法术位不足，提交被拒` };
        }
      }
      if (op.concentration && beginConcentration) {
        beginConcentration(actor.id, op.spellName);
      }
      combatStore.pushCombatEvent(record.id, {
        kind: 'cast',
        round: request.round,
        actorId: actor.id,
        targetId: op.targetId,
        spellName: op.spellName,
        text: op.roundText,
      });
      if (op.actionCost === 'action' && !consumedAction) {
        consumeAction(actor.id);
        consumedAction = true;
      }
      if (op.actionCost === 'bonus' && !consumedBonus) {
        consumeBonusAction(actor.id);
        consumedBonus = true;
      }
    } else if (op.kind === 'ready-item') {
      if (op.childId) {
        const inv = getCombatInventory(record, actor);
        const res = combatStore.setCombatantHand(record.id, actor.id, op.childId, op.slot, inv);
        if (!res.success) return { ok: false, reason: `换持失败：${res.message}` };
      } else {
        combatStore.unsetCombatantHand(record.id, actor.id, op.slot);
      }
    } else if (op.kind === 'hand-state') {
      combatStore.setCombatantHandState(record.id, actor.id, op.slot, op.state);
    } else if (op.kind === 'spell-slot') {
      const levelKey = `level${op.level}` as SpellSlotLevel;
      if (op.consume) {
        if (!combatStore.consumeSpellSlot(record.id, actor.id, levelKey)) {
          return { ok: false, reason: `${op.level} 环法术位不足，提交被拒` };
        }
      } else {
        combatStore.restoreSpellSlot(record.id, actor.id, levelKey);
      }
    } else if (op.kind === 'stop-concentration') {
      const latest = combatStore.get(record.id) ?? record;
      const self = latest.combatants.find((c) => c.id === actor.id);
      combatStore.removeConcentrationStatuses(self?.concentration);
      combatStore.update(record.id, {
        combatants: latest.combatants.map((c) => (c.id === actor.id ? { ...c, concentration: undefined } : c)),
        updatedAt: Date.now(),
      });
      combatStore.cleanupConcentrationMaintainTodos(record.id);
    } else if (op.kind === 'note') {
      if (op.actionCost === 'action' && !consumedAction) {
        consumeAction(actor.id);
        consumedAction = true;
      }
      if (op.actionCost === 'bonus' && !consumedBonus) {
        consumeBonusAction(actor.id);
        consumedBonus = true;
      }
    } else if (op.kind === 'end-turn') {
      endTurn = true;
    }
  }

  // 先推进回合再写表格/装备：advanceTurn 闭包基于旧 state 补新回合行，
  // 本轮文本在其之后写回才不会被旧快照覆盖
  if (endTurn) advanceTurn();

  const roundTexts = ops
    .map((op) => (op.kind === 'end-turn' ? '' : op.roundText))
    .filter(Boolean);
  if (roundTexts.length > 0 || Object.keys(appliedChanges).length > 0) {
    const latest = combatStore.get(record.id) ?? record;
    const patch: Partial<CombatRecord> = {};
    if (roundTexts.length > 0) {
      const rounds = (latest.rounds ?? []).map((r) => ({ ...r }));
      while (rounds.length < request.round) rounds.push({});
      const row = rounds[request.round - 1] ?? {};
      const merged = [row[actor.id], ...roundTexts].filter(Boolean).join('；');
      rounds[request.round - 1] = { ...row, [actor.id]: merged };
      patch.rounds = rounds;
    }
    if (Object.keys(appliedChanges).length > 0) {
      patch.equipmentChanges = {
        ...(latest.equipmentChanges ?? {}),
        ...appliedChanges,
      };
    }
    combatStore.update(record.id, patch);
  }

  if (appliedDamages.length > 0) {
    console.info(`[turn-commit] ${actor.name}: ${appliedDamages.join(', ')}`);
  }
  // 反应机会回执：store 里已持久化（带真实 id），此处仅向调用方提示待处理的窗口
  return collectedReactions.length > 0 ? { ok: true, reactions: collectedReactions } : { ok: true };
}
