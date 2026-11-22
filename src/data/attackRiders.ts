// attack_rider 通道执行器：命中触发类特性（至圣斩/震慑拳）的可用性构建与落地结算。
// 可用性在伤害弹窗打开时只读派生（池漏斗 + 法术位 delta 口径）；资源消耗与状态挂载
// 只在 DM 确认伤害时写库（applyAttackRiders），与「勾选声明不扣资源」语义一致。
import combatStore from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import { resolveFeatureCapability, type AttackRiderSpec } from '@/data/featureCapabilities';
import { resolvePoolKey } from '@/data/featurePool';
import { globalStatusManager } from '@/data/statusManager';
import battlegroundStore from '@/data/battlegroundStore';
import { GRID_PRESETS } from '@/types/battleground';
import type { CombatRecord, Combatant } from '@/types/combat';
import type { Character, SpellSlotLevel } from '@/types/character';
import type { RosterActiveFeature, RosterSpellSlot } from '@/types/realtime';

/** 豁免失败效果文本（行记录 + 弹窗失败提示共用） */
const FAIL_LABELS: Record<NonNullable<AttackRiderSpec['save']>['failStatus'], string> = {
  stunned: '震慑',
  prone: '倒地',
  frightened: '恐惧',
  goaded: '挑衅',
  disarmed: '缴械',
};

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
  save?: { abilityLabel: string; dc: number; failHint: string; failLabel: string };
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
          ? { abilityLabel: ABILITY_LABELS[spec.save.ability] ?? spec.save.ability, dc: spec.save.dc(char), failHint: spec.save.todo, failLabel: FAIL_LABELS[spec.save.failStatus] }
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
 * 玩家端 rider 选项构建（投影版）：玩家浏览器没有本地 CombatRecord，
 * 池/法术位余量从广播投影（RosterActiveFeature / RosterSpellSlot）读取。
 * DC 与伤害骰仍由注册表 spec 按玩家角色卡推导，与 DM 端 getAttackRiders 同构。
 */
export function getAttackRidersForPlayer(
  char: Character,
  activeFeatures: RosterActiveFeature[] | null | undefined,
  spellSlots?: RosterSpellSlot[] | null,
): AttackRiderOption[] {
  if (!activeFeatures || activeFeatures.length === 0) return [];
  const options: AttackRiderOption[] = [];

  for (const rf of activeFeatures) {
    const capability = resolveFeatureCapability(rf.name);
    if (capability.channel !== 'attack_rider' || !capability.attackRider) continue;
    const spec: AttackRiderSpec = capability.attackRider;
    if (spec.cost.kind === 'pool') {
      const poolKey = rf.poolKey;
      const cost = rf.cost ?? spec.cost.cost;
      // disabled = 池耗尽投影标记；poolLeft 缺省按不可用处理（老 DM 版本无该字段）
      if (!poolKey || rf.disabled || rf.poolLeft == null || rf.poolLeft < cost) continue;
      options.push({
        featureName: rf.name,
        hint: spec.hint,
        kind: 'pool',
        poolKey,
        poolCost: cost,
        poolAvailable: rf.poolLeft,
        poolMax: rf.poolMax,
        damage: spec.damage,
        bonusDice: spec.bonusDice,
        save: spec.save
          ? { abilityLabel: ABILITY_LABELS[spec.save.ability] ?? spec.save.ability, dc: spec.save.dc(char), failHint: spec.save.todo, failLabel: FAIL_LABELS[spec.save.failStatus] }
          : undefined,
      });
    } else {
      // 法术位成本：从投影余量（max - used，已含战斗 delta）列出可用环级
      const levels: { level: SpellSlotLevel; remaining: number }[] = [];
      for (const s of spellSlots ?? []) {
        const remaining = s.max - s.used;
        if (remaining > 0) {
          levels.push({ level: `level${s.level}` as SpellSlotLevel, remaining });
        }
      }
      if (levels.length === 0) continue;
      options.push({
        featureName: rf.name,
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
    // 延迟引爆 rider（渗透劲类）：命中勾选即埋劲——挂标记状态（metadata.attackerId 记录施劲者）；
    // 同一时间仅一个目标受影响：挂载前解除其他目标上的旧标记
    if (spec.embed) {
      for (const other of record.combatants) {
        if (other.id === target.id) continue;
        for (const inst of globalStatusManager.getActiveStatuses(other.id, 'combat')) {
          if (inst.definitionId === spec.embed.statusId) globalStatusManager.declareEnd(inst.instanceId);
        }
      }
      const mark = globalStatusManager.applyEffect(target.id, spec.embed.statusId, 'combat', record.id, {
        ...(record.mode === 'playback'
          ? { combatMode: 'playback' as const, startRound: currentRound0 }
          : { combatMode: 'simulation' as const }),
      });
      mark.metadata = { ...mark.metadata, attackerId: attacker.id, attackerName: attacker.name };
      line += `：劲力已埋入「${target.name}」（DM 可用动作引爆）`;
    } else if (sel.saveResult) {
      const abilityLabel = ABILITY_LABELS[spec.save!.ability] ?? '';
      const isFail = sel.saveResult === 'fail';
      if (isFail && spec.push) {
        // 推撞：纯位移不挂状态——按攻击者→目标方向推 feet/5 格（切比雪夫步进，clamp 边界）
        const cells = Math.max(1, Math.round(spec.push.feet / 5));
        const bg = battlegroundStore.get(record.id);
        const tTok = bg?.tokens.find((t) => t.combatantId === target.id);
        const aTok = bg?.tokens.find((t) => t.combatantId === attacker.id);
        if (tTok && aTok) {
          const preset = GRID_PRESETS[bg!.size];
          const dx = Math.sign(tTok.col - aTok.col);
          const dz = Math.sign(tTok.row - aTok.row);
          const nc = Math.max(0, Math.min(preset.cols - 1, tTok.col + dx * cells));
          const nr = Math.max(0, Math.min(preset.rows - 1, tTok.row + dz * cells));
          if (nc !== tTok.col || nr !== tTok.row) {
            battlegroundStore.placeToken(record.id, { combatantId: target.id, col: nc, row: nr });
            const moved = Math.max(Math.abs(nc - tTok.col), Math.abs(nr - tTok.row));
            line += `：目标${abilityLabel}豁免失败，被推离 ${moved} 格（${spec.push.feet} 尺）`;
          } else {
            line += `：目标${abilityLabel}豁免失败，已在边界无处可推`;
          }
        } else {
          line += `：目标${abilityLabel}豁免失败，被推离 ${spec.push.feet} 尺（无沙盘棋子，请手动处理位置）`;
        }
      } else {
        line += isFail
          ? `：目标${abilityLabel}豁免失败，${FAIL_LABELS[spec.save!.failStatus]}`
          : `：目标${abilityLabel}豁免成功`;
      }
    }
    lines.push(line);
    // 豁免失败：挂状态（push 型只位移不挂状态）+ TurnTodo 提醒解除（endRound 与 P2 status 约定同构：start + duration）
    if (sel.saveResult === 'fail' && spec.save && !spec.push && opts?.targetAlive !== false) {
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
