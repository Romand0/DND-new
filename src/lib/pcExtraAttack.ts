import type { Character } from '@/types/character';
import { getEffectiveLevel } from '@/lib/experience';

/**
 * PC 每次攻击动作的攻击次数（5e Extra Attack 家族）。
 *
 * 主路径：角色卡 features 命中额外攻击类特性（「额外攻击/Extra Attack/渴刃/Thirsting Blade」，
 * 含 level 生效等级判定）→ 2 击；战士 11 级 3 击、20 级 4 击（2014 PHB 档位递进）。
 * 兜底：老卡无 features 数据时按 class+level 硬规则（战/野/圣/游/僧 5 级双击 + 战士递进）。
 * 未命中任何规则 → 1（普通单次攻击）。
 */
export function derivePcAttacksPerAction(char: Character | null | undefined): number {
  if (!char) return 1;
  const level = getEffectiveLevel(char);
  const cls = char.profession?.class ?? '';
  const fighterTiers = (): number => {
    if (cls === '战士') {
      if (level >= 20) return 4;
      if (level >= 11) return 3;
    }
    return 2;
  };
  const feats = char.features ?? [];
  for (const f of feats) {
    if (!/额外攻击|Extra Attack|渴刃|Thirsting Blade/i.test(f.name ?? '')) continue;
    // 特性条目缺 level 时按 5 级生效（最早的 Extra Attack 档位）
    const need = typeof f.level === 'number' ? f.level : 5;
    if (level >= need) return fighterTiers();
  }
  if (['战士', '野蛮人', '圣武士', '游侠', '武僧'].includes(cls) && level >= 5) {
    return fighterTiers();
  }
  return 1;
}
