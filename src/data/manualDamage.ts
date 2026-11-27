// 手动记录的伤害结算：伤害类型 → 抗性/易伤/免疫 → 最终伤害（纯函数）
//
// 手动记录允许 DM 直接填原始伤害值，结算必须与自动攻击链共用同一套抗性引擎
// （data/damageRules），否则免疫/抗性/易伤与再生否定条件都会被旁路。
import {
  createUntypedResolution,
  formatDamageBreakdown,
  inferWeaponDamageSource,
  normalizeDamageType,
  resolveDamage,
  spellDamageSource,
} from '@/data/damageRules';
import type {
  DamageAffinitySet,
  DamageResolution,
  DamageSource,
  DamageType,
} from '@/types/damage';

/** 手动攻击的来源类型：决定「非魔法武器」「法术伤害」等限定词是否命中 */
export type ManualAttackSource = 'weapon' | 'spell' | 'effect';

/** 武器材质判定：null/undefined = 按攻击方式自动推断，true/false = DM 在高级选项中显式指定 */
export interface ManualWeaponTraits {
  magical?: boolean | null;
  silvered?: boolean | null;
  adamantine?: boolean | null;
}

function withOverride(auto: boolean | undefined, override: boolean | null | undefined): boolean | undefined {
  return override === true || override === false ? override : auto;
}

/** 攻击方式文本的自动推断结果（高级选项里展示给 DM，并可被显式指定覆盖） */
export function inferManualWeaponTraits(method: string): { magical: boolean; silvered: boolean; adamantine: boolean } {
  const source = inferWeaponDamageSource({ note: method });
  return {
    magical: source.magical || (/魔法/.test(method) && !/非魔法/.test(method)),
    silvered: !!source.silvered,
    adamantine: !!source.adamantine,
  };
}

export function manualDamageSource(
  kind: ManualAttackSource,
  method: string,
  traits?: ManualWeaponTraits | null,
): DamageSource {
  if (kind === 'spell') return spellDamageSource();
  if (kind === 'effect') return { kind: 'effect' };
  const auto = inferManualWeaponTraits(method);
  return {
    kind: 'weapon',
    magical: withOverride(auto.magical, traits?.magical),
    silvered: withOverride(auto.silvered, traits?.silvered),
    adamantine: withOverride(auto.adamantine, traits?.adamantine),
  };
}

export interface ManualDamagePreview {
  damageType: DamageType | null;
  resolution: DamageResolution;
  /** 抗性/易伤/免疫结算后的最终伤害 */
  final: number;
  /** 抗性明细文案（如「火焰 24→12（抗性）」），无抗性时为空串 */
  breakdown: string;
  /** 命中抗性/易伤/免疫的简写标签，无则空串 */
  affinity: string;
}

export function resolveManualDamage(params: {
  amount: number;
  damageType?: string | null;
  source?: ManualAttackSource;
  method?: string;
  /** 高级选项中的武器材质显式指定（null = 自动推断） */
  weaponTraits?: ManualWeaponTraits | null;
  affinities?: DamageAffinitySet | null;
}): ManualDamagePreview {
  const damageType = normalizeDamageType(params.damageType);
  const amount = Math.max(0, Math.floor(Number.isFinite(params.amount) ? params.amount : 0));
  const resolution = damageType
    ? resolveDamage(
        [{ type: damageType, amount }],
        params.affinities ?? null,
        manualDamageSource(params.source ?? 'weapon', params.method ?? '', params.weaponTraits),
      )
    : createUntypedResolution(amount);

  const affinity = resolution.anyImmune
    ? '免疫'
    : resolution.anyResisted && resolution.anyVulnerable
      ? '抗性+易伤'
      : resolution.anyResisted
        ? '抗性'
        : resolution.anyVulnerable
          ? '易伤'
          : '';

  return {
    damageType,
    resolution,
    final: resolution.final,
    breakdown: formatDamageBreakdown(resolution),
    affinity,
  };
}
