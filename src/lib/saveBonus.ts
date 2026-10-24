import type { Character, AbilityKey } from '@/types/character';
import type { Combatant } from '@/types/combat';
import { characterStore } from '@/data/characterStore';

export const ABILITY_LABEL_MAP: Record<AbilityKey, string> = {
  strength: '力量', dexterity: '敏捷', constitution: '体质',
  intelligence: '智力', wisdom: '感知', charisma: '魅力',
};

export const SAVE_ABILITY_KEYS: AbilityKey[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];

export function fmtBonus(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/**
 * 豁免加值统一计算：角色卡参战者走角色卡路径（含专精/覆盖等 store 逻辑），
 * NPC 参战者走属性快照路径（调整值 + 图鉴熟练 × PB）。
 * SpellCheckStep 与试验场仪表盘共用，保证仪表盘展示与实际检定严格同源。
 */
export function computeSaveBonus(
  target: Combatant,
  character: Character | null,
  abilityKey: AbilityKey,
): { total: number; mod: number; prof: number; score: number | null; formula: string; fromCharacter: boolean } | null {
  const abilityLabel = ABILITY_LABEL_MAP[abilityKey];
  if (character) {
    const mod = character.abilities?.[abilityKey]?.modifier ?? 0;
    const total = characterStore.getSaveBonus(character, abilityKey);
    const prof = total - mod;
    const score = character.abilities?.[abilityKey]?.score ?? null;
    return {
      total,
      mod,
      prof,
      score,
      formula: `${abilityLabel} ${score ?? '?'} → 调整值 ${fmtBonus(mod)}` +
        (prof > 0 ? ` + 熟练 ${fmtBonus(prof)}` : '（无熟练）') +
        ` → 豁免 ${fmtBonus(total)}`,
      fromCharacter: true,
    };
  }
  const score = target[abilityKey as keyof Combatant] as number | undefined;
  if (typeof score !== 'number') return null;
  const mod = Math.floor((score - 10) / 2);
  const prof = target.proficientSaves?.includes(abilityKey) ? (target.proficiencyBonus ?? 2) : 0;
  const total = mod + prof;
  return {
    total,
    mod,
    prof,
    score,
    formula: `${abilityLabel} ${score} → 调整值 ${fmtBonus(mod)}` +
      (prof > 0 ? ` + 图鉴熟练 ${fmtBonus(prof)}` : '（无熟练）') +
      ` → 豁免 ${fmtBonus(total)}`,
    fromCharacter: false,
  };
}
