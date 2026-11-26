// 手动记录的命中判定：d20（含优/劣势两颗）+ 加值 vs AC，自然 1/20 与重击（纯函数）
//
// 语义与自动攻击链（CombatAttackModal.handleConfirmRoll）保持一致：
// 优/劣势下任一骰为自然 20 → 直接命中（优先于自然 1 与取高/取低）；自然 1 必失。
import type { ManualMode } from '@/types/combat';

export interface ManualAttackRollInput {
  d20: number[];
  bonus: number;
  ac: number;
  mode: ManualMode;
  /** 手动勾选重击（伤害骰翻倍由 DM 自行结算）；自然 20 自动重击 */
  forceCrit?: boolean;
}

export interface ManualAttackRollResult {
  /** 生效骰（优/劣势为取高/取低后的值；任一骰自然 20 时为 20） */
  d20: number;
  total: number;
  isNatural1: boolean;
  isNatural20: boolean;
  hit: boolean;
  critical: boolean;
}

export function resolveManualAttackRoll(input: ManualAttackRollInput): ManualAttackRollResult {
  const dice = input.d20.filter(n => Number.isFinite(n));
  const bonus = Number.isFinite(input.bonus) ? input.bonus : 0;
  const mode = input.mode;

  // 优/劣势下任一骰为自然 20 → 直接命中（与自动攻击链一致）
  const hasNatural20 = mode !== 'none' && dice.some(n => n === 20);
  let d20: number;
  if (hasNatural20) {
    d20 = 20;
  } else if (mode === 'advantage') {
    d20 = Math.max(...dice);
  } else if (mode === 'disadvantage') {
    d20 = Math.min(...dice);
  } else {
    d20 = dice[0] ?? 0;
  }

  const isNatural1 = !hasNatural20 && d20 === 1;
  const isNatural20 = hasNatural20 || d20 === 20;
  const total = d20 + bonus;
  const hit = isNatural20 ? true : isNatural1 ? false : total >= input.ac;
  const critical = hit && (isNatural20 || !!input.forceCrit);

  return { d20, total, isNatural1, isNatural20, hit, critical };
}

/** 日志用的掷骰明细，如「优势 d20【7,18】取18 +5=【23】」「d20【12】-2=【10】」 */
export function formatManualRollSummary(
  input: Pick<ManualAttackRollInput, 'd20' | 'bonus' | 'mode'>,
  result: ManualAttackRollResult,
): string {
  const bonusPart = input.bonus === 0 ? '' : input.bonus > 0 ? `+${input.bonus}` : `${input.bonus}`;
  if (input.mode === 'none') {
    return `d20【${input.d20[0] ?? result.d20}】${bonusPart}=【${result.total}】`;
  }
  const modeLabel = input.mode === 'advantage' ? '优势' : '劣势';
  const diceLabel = input.d20.join(',');
  return `${modeLabel} d20【${diceLabel}】取${result.d20}${bonusPart}=【${result.total}】`;
}
