// attack_rider 通道执行器：命中触发类特性（至圣斩/震慑拳）的可用性构建与落地结算。
// 可用性在伤害弹窗打开时只读派生（池漏斗 + 法术位 delta 口径）；资源消耗与状态挂载
// 只在 DM 确认伤害时写库（applyAttackRiders），与「勾选声明不扣资源」语义一致。
import combatStore from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import { resolveFeatureCapability, type AttackRiderSpec } from '@/data/featureCapabilities';
import { resolvePoolKey } from '@/data/featurePool';
import { globalStatusManager } from '@/data/statusManager';
import type { CombatRecord, Combatant } from '@/types/combat';
import type { Character, SpellSlotLevel } from '@/types/character';

/** 伤害弹窗勾选区的一个可发动 rider 选项（只读快照，落地时按此扣资源） */
export interface AttackRiderOption {
  featureName: string;
  hint: string;
  kind: 'pool' | 'spellSlot';
  /** pool 成本：池键与战斗内余量（available < cost 时弹窗禁选） */
  poolKey?: string;
  poolCost?: number;
  poolAvailable?: number;
  poolMax?: number;
  /** spellSlot 成本：卡余量叠加战斗 delta 后仍 > 0 的环级（选环升级 = 每高 1 环 +perSlotDice） */
  slotLevels?: { level: SpellSlotLevel; remaining: number }[];
  damage?: { dice: string; damageType: string };
  bonusDice?: { dice: string; damageType: string; vs: string[] };
  perSlotDice?: { dice: string; damageType: string };
  /** 命中后豁免（震慑拳）：DC 已按攻击者角色卡算好 */
  save?: { abilityLabel: string; dc: number; failHint: string };
}

/** 玩家/DM 勾选结果（弹窗 payload 回传） */
export interface AttackRiderSelection {
  featureName: string;
  /** spellSlot 成本选定的消耗环级 */
  slotLevel?: SpellSlotLevel;
  /** 豁免 rider 结果（仅带 save 的 rider） */
  saveResult?: 'success' | 'fail';
}

const ABILITY_LABELS: Record<string, string> = {
  strength: '力量', dexterity: '敏捷', constitution: '体质',
  intelligence: '智力', wisdom: '感知', charisma: '魅力',
};

const SLOT_LABEL: Partial<Record<SpellSlotLevel, string>> = {
  level1: '1环', level2: '2环', level3: '3环', level4: '4环', level5: '5环',
  level6: '6环', level7: '7环', level8: '8环', level9: '9环',
};

/**
 * 构建攻击者的可用 rider 选项（PC 影子卡特性驱动；NPC 无特性卡 → 空数组）。
 * 纯只读：池余量走 getFeaturePoolView，法术位余量 = 卡 max-used 与战斗 delta 叠加。
 */
export function getAttackRiders(record: CombatRecord, attacker: Combatant): AttackRiderOption[] {
  if (!attacker.isPc || !attacker.characterId) return [];
  const char = characterStore.get(attacker.characterId);
  if (!char) return [];
  const poolView = combatStore.getFeaturePoolView(record.id, attacker.id);
  const slotDeltas = combatStore.getSpellSlotDeltas(record.id, attacker.id);
  const options: AttackRiderOption[] = [];

  for (const f of char.features ?? []) {
    const capability = resolveFeatureCapability(f.name);
    if (capability.channel !== 'attack_rider' || !capability.attackRider) continue;
    const spec: AttackRiderSpec = capability.attackRider;
    if (spec.cost.kind === 'pool') {
      const poolKey = resolvePoolKey(f);
      const entry = poolKey ? poolView.find(p => p.featureKey === poolKey) : undefined;
      const cost = spec.cost.cost;
      const available = entry?.available;
      if (poolKey == null || available == null || available < cost) continue;
      options.push({
        featureName: f.name,
        hint: spec.hint,
        kind: 'pool',
        poolKey,
        poolCost: cost,
        poolAvailable: available,
        poolMax: entry?.max,
        damage: spec.damage,
        bonusDice: spec.bonusDice,
        save: spec.save
          ? { abilityLabel: ABILITY_LABELS[spec.save.ability] ?? spec.save.ability, dc: spec.save.dc(char), failHint: spec.save.todo }
          : undefined,
      });
    } else {
      // 法术位成本：列出全部仍有余量的环级（1 环起）；无任何余量则不显示
      const slot = char.spells?.spellSlots ?? {};
      const levels: { level: SpellSlotLevel; remaining: number }[] = [];
      for (let lv = 1; lv <= 9; lv++) {
        const key = `level${lv}` as SpellSlotLevel;
        const s = slot[key];
        if (!s) continue;
        const remaining = s.max - (s.used ?? 0) - (slotDeltas[key] ?? 0);
        if (remaining > 0) levels.push({ level: key, remaining });
      }
      if (levels.length === 0) continue;
      options.push({
        featureName: f.name,
        hint: spec.hint,
        kind: 'spellSlot',
        slotLevels: levels,
        damage: spec.damage,
        bonusDice: spec.bonusDice,
        perSlotDice: spec.perSlotDice,
      });
    }
  }
  return options;
}

/**
 * 落地勾选结果：扣资源（池漏斗 / 法术位 delta）+ 豁免失败挂状态与 TurnTodo。
 * @param currentRound0 0-based 放映轮次
 * @param opts.targetAlive 目标在伤害后是否存活（死亡跳过震慑挂载；资源照常消耗）
 * @returns 回合记录补充行（每 rider 一行；无勾选返回空数组）
 */
export function applyAttackRiders(
  record: CombatRecord,
  attacker: Combatant,
  target: Combatant,
  selections: AttackRiderSelection[],
  currentRound0: number,
  opts?: { targetAlive?: boolean },
): string[] {
  const lines: string[] = [];
  for (const sel of selections) {
    const capability = resolveFeatureCapability(sel.featureName);
    if (capability.channel !== 'attack_rider' || !capability.attackRider) continue;
    const spec = capability.attackRider;
    if (spec.cost.kind === 'pool') {
      // 找到带池公式的池主特性（成员引用池主池键），池扣减走漏斗（与主动按钮同口径）
      const char = attacker.characterId ? characterStore.get(attacker.characterId) : null;
      const f = (char?.features ?? []).find(x => x.name === sel.featureName);
      const poolKey = f ? resolvePoolKey(f) : null;
      if (poolKey) {
        combatStore.consumeFeatureUse(record.id, attacker.id, poolKey, spec.cost.cost);
      }
    } else if (sel.slotLevel) {
      combatStore.consumeSpellSlot(record.id, attacker.id, sel.slotLevel);
    }
    let line = `「${sel.featureName}」发动${spec.cost.kind === 'pool' ? `（${spec.cost.cost} 点）` : `（${SLOT_LABEL[sel.slotLevel!] ?? sel.slotLevel ?? ''}法术位）`}`;
    if (sel.saveResult) {
      line += sel.saveResult === 'fail'
        ? `：目标${ABILITY_LABELS[spec.save!.ability] ?? ''}豁免失败，震慑`
        : `：目标${ABILITY_LABELS[spec.save!.ability] ?? ''}豁免成功`;
    }
    lines.push(line);
    // 豁免失败：挂震慑状态（复用 C 类通道的挂载口径）+ TurnTodo 提醒解除（endRound 与 P2 status 约定同构：start + duration）
    if (sel.saveResult === 'fail' && spec.save && opts?.targetAlive !== false) {
      globalStatusManager.applyEffect(target.id, spec.save.failStatus, 'combat', record.id, {
        durationRounds: spec.save.durationRounds,
        ...(record.mode === 'playback'
          ? { combatMode: 'playback' as const, startRound: currentRound0 }
          : { combatMode: 'simulation' as const }),
      });
      combatStore.addTurnTodo(record.id, {
        combatantId: target.id,
        name: spec.save.todo,
        type: 'condition_check',
        startRound: currentRound0,
        endRound: currentRound0 + spec.save.durationRounds,
      });
    }
  }
  return lines;
}
