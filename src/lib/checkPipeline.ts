// src/lib/checkPipeline.ts
// 通用检定加工管线（非战斗）：d20 输入 → 优劣势裁决 → 加值明细 → 应用值
// 复用 advantageRules 检测器（妖精血统等）与 attackBonus 的万事通加值。
// 战斗内的状态奖惩与 pendingAdvantageSources 挂参战者/记录，本管线天然不涉及（非战斗语义）。
import type { Character } from '@/types/character';
import type { CheckKind } from '@/types/roundTable';
import { SKILL_LABELS } from '@/types/roundTable';
import { detectAdvantage, resolveRollMode } from '@/data/advantageRules';
import { jackOfAllTradesBonus } from '@/lib/attackBonus';
import { characterStore } from '@/data/characterStore';
import type { AbilityKey } from '@/types/character';
import type { ManualMode } from '@/types/combat';

export interface CheckBonusItem {
  label: string;
  value: number;
}

export interface CheckPipelineResult {
  /** 优劣势裁决后保留的 d20 */
  d20Kept: number;
  rollMode: 'advantage' | 'disadvantage' | 'none';
  modeReasons: string[];
  bonuses: CheckBonusItem[];
  /** d20Kept + Σbonuses */
  appliedValue: number;
}

const ABILITY_LABEL: Record<AbilityKey, string> = {
  strength: '力量', dexterity: '敏捷', constitution: '体质',
  intelligence: '智力', wisdom: '感知', charisma: '魅力',
};

/**
 * 加工一次检定：
 * - manualMode 手动优劣势（计算器场景 DM 口头指示），默认 none=纯引擎裁决
 * - d20s 单骰时 rollMode 按 none 处理（引擎裁决出优劣势但只掷了一骰，应用值取该骰）
 * - d20s 双骰时按 rollMode 取高（优势）/ 低（劣势）
 * - save 类检定传 saveAbilityKey 供引擎场景判定（妖精血统等）；ability/skill 传 undefined
 */
export function runCheckPipeline(
  character: Character,
  checkKind: CheckKind,
  checkKey: string,
  d20s: number[],
  manualMode: ManualMode = 'none',
): CheckPipelineResult {
  // 场景与能力
  let scene: 'ability_check' | 'skill_check' | 'saving_throw' = 'ability_check';
  let abilityKey: AbilityKey = 'strength';
  let saveAbility: AbilityKey | undefined;

  if (checkKind === 'save') {
    scene = 'saving_throw';
    abilityKey = checkKey as AbilityKey;
    saveAbility = abilityKey;
  } else if (checkKind === 'skill') {
    scene = 'skill_check';
    abilityKey = SKILL_LABELS[checkKey]?.ability ?? 'strength';
  } else {
    scene = 'ability_check';
    abilityKey = checkKey as AbilityKey;
  }

  // 优劣势：手动优先，引擎自动检测兜底
  const auto = detectAdvantage({
    scene,
    attacker: null,
    target: null,
    attackerCharacter: character,
    targetCharacter: null,
    saveAbility,
  });
  const { mode, reasons } = resolveRollMode(manualMode, auto);
  const modeReasons = reasons.map(r => r.label);

  // 保留骰：优劣势双骰取高/低，否则取第一骰
  const valid = d20s.filter(n => n >= 1 && n <= 20);
  const d20Kept = valid.length >= 2
    ? (mode === 'advantage' ? Math.max(...valid) : mode === 'disadvantage' ? Math.min(...valid) : valid[0])
    : (valid[0] ?? 1);

  // 加值明细
  const bonuses: CheckBonusItem[] = [];
  const abilityMod = character.abilities?.[abilityKey]?.modifier ?? 0;
  bonuses.push({ label: `${ABILITY_LABEL[abilityKey]}调整`, value: abilityMod });
  if (checkKind === 'skill') {
    const skill = character.skills?.[checkKey as keyof typeof character.skills];
    const prof = character.proficiencyBonus ?? 0;
    if (skill?.expertise) {
      bonuses.push({ label: '专精（熟练翻倍）', value: prof * 2 });
    } else if (skill?.proficient) {
      bonuses.push({ label: '技能熟练', value: prof });
    } else {
      const jack = jackOfAllTradesBonus(character, false);
      if (jack > 0) bonuses.push({ label: '万事通（非熟练检定加半熟练）', value: jack });
    }
    if (skill?.extra) {
      bonuses.push({ label: '技能额外加值', value: skill.extra });
    }
  } else if (checkKind === 'ability') {
    const jack = jackOfAllTradesBonus(character, false);
    if (jack > 0) bonuses.push({ label: '万事通（非熟练检定加半熟练）', value: jack });
  } else {
    // save：走 store 派生（含豁免熟练），替换上面的纯属性加值
    bonuses.length = 0;
    bonuses.push({ label: '豁免加值', value: characterStore.getSaveBonus(character, abilityKey) });
  }

  const appliedValue = d20Kept + bonuses.reduce((s, b) => s + b.value, 0);
  return { d20Kept, rollMode: mode, modeReasons, bonuses, appliedValue };
}

/** 应用值 → 判定（value_only 模式由调用方传 null DC） */
export function judgeCheck(appliedValue: number, dc: number | null): 'success' | 'fail' | null {
  if (dc === null) return null;
  return appliedValue >= dc ? 'success' : 'fail';
}
