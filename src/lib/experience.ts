import type { Character } from '@/types/character';

// 5E 2014 等级经验表。等级由经验推导，角色卡 level 字段仅作兼容缓存。
export const XP_TABLE = [
  0,
  300,
  900,
  2700,
  6500,
  14000,
  23000,
  34000,
  48000,
  64000,
  85000,
  100000,
  120000,
  140000,
  165000,
  195000,
  225000,
  265000,
  305000,
  355000,
];

export function getLevelFromExp(exp: number): number {
  if (typeof exp !== 'number' || exp < 0) return 1;
  let level = 1;
  for (let i = 0; i < XP_TABLE.length; i++) {
    if (exp >= XP_TABLE[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return Math.min(level, 20);
}

export function getProficiencyBonus(level: number): number {
  return Math.ceil(Math.min(Math.max(level, 1), 20) / 4) + 1;
}

export function getEffectiveLevel(character: Pick<Character, 'experience'>): number {
  return getLevelFromExp(character.experience ?? 0) || 1;
}

export function getNextLevelInfo(currentExp: number): {
  currentLevel: number;
  nextLevel: number;
  expNeeded: number;
  expProgress: number;
  expRemaining: number;
} {
  const currentLevel = getLevelFromExp(currentExp);
  const nextLevel = Math.min(currentLevel + 1, 20);
  const needed = XP_TABLE[nextLevel - 1] || XP_TABLE[XP_TABLE.length - 1];
  const previous = XP_TABLE[currentLevel - 1] || 0;
  const progress = needed > previous ? (currentExp - previous) / (needed - previous) : 1;
  return {
    currentLevel,
    nextLevel,
    expNeeded: needed,
    expProgress: Math.min(Math.max(progress, 0), 1),
    expRemaining: Math.max(needed - currentExp, 0),
  };
}
