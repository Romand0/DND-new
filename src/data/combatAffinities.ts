// 参战者抗性快照读取：新记录直接读 damageAffinities，旧记录按 templateId 回退模板，
// 并合并当前生效的状态效果提供的抗性/易伤/免疫。
import type { Combatant, NpcTemplate } from '@/types/combat';
import type { AffinityEntry, DamageAffinitySet, DamageSourceKind, DamageType } from '@/types/damage';
import { normalizeDamageType, parseDamageAffinities } from '@/data/damageRules';
import combatStore from '@/data/combatStore';
import npcTemplateStore from '@/data/npcTemplateStore';
import { globalStatusManager } from '@/data/statusManager';

type TemplateAffinitySource = Pick<
  NpcTemplate,
  'damageResistances' | 'damageImmunities' | 'damageVulnerabilities'
>;

const EMPTY_AFFINITY_SET = (): DamageAffinitySet => ({
  resistances: [],
  vulnerabilities: [],
  immunities: [],
  notes: [],
  unsupported: [],
});

export function buildCombatantAffinities(
  template?: TemplateAffinitySource | null
): DamageAffinitySet | undefined {
  if (!template) return undefined;
  const hasAny =
    (template.damageResistances?.length ?? 0) > 0 ||
    (template.damageImmunities?.length ?? 0) > 0 ||
    (template.damageVulnerabilities?.length ?? 0) > 0;
  if (!hasAny) return undefined;
  return parseDamageAffinities({
    resistances: template.damageResistances,
    immunities: template.damageImmunities,
    vulnerabilities: template.damageVulnerabilities,
  });
}

/** 合并两组亲和条目；任一侧为空时返回另一侧的副本，避免调用方修改共享快照 */
export function mergeAffinitySets(
  base?: DamageAffinitySet | null,
  extra?: DamageAffinitySet | null
): DamageAffinitySet | null {
  if (!base && !extra) return null;
  const merged = EMPTY_AFFINITY_SET();
  for (const set of [base, extra]) {
    if (!set) continue;
    merged.resistances.push(...set.resistances);
    merged.vulnerabilities.push(...set.vulnerabilities);
    merged.immunities.push(...set.immunities);
    for (const note of set.notes) {
      if (!merged.notes.includes(note)) merged.notes.push(note);
    }
    merged.unsupported.push(...set.unsupported);
  }
  return merged;
}

/**
 * 把状态效果转换为亲和条目。
 * 约定：effect.type 为 damage_resistance / damage_vulnerability / damage_immunity，
 * effect.config 支持 damageType / types / magical / silvered / adamantine / sourceKind。
 * 未提供伤害类型时表示不限类型（如“所有伤害”）。
 */
export function buildStatusAffinities(targetId: string): DamageAffinitySet | null {
  const effects = globalStatusManager.getEffects(targetId);
  const set = EMPTY_AFFINITY_SET();
  let found = false;

  for (const effect of effects) {
    const kind =
      effect.type === 'damage_resistance' ? 'resistance'
      : effect.type === 'damage_vulnerability' ? 'vulnerability'
      : effect.type === 'damage_immunity' ? 'immunity'
      : null;
    if (!kind) continue;

    const config = effect.config ?? {};
    const rawTypes: unknown[] = Array.isArray(config.types)
      ? config.types
      : config.damageType
        ? [config.damageType]
        : [];
    const types = rawTypes
      .map((value) => normalizeDamageType(typeof value === 'string' ? value : null))
      .filter((value): value is DamageType => value !== null);
    const sourceKind: DamageSourceKind | undefined =
      config.sourceKind === 'weapon' || config.sourceKind === 'spell' || config.sourceKind === 'effect'
        ? config.sourceKind
        : undefined;

    const entry: AffinityEntry = {
      id: `status:${effect.id}`,
      kind,
      raw: effect.description ?? effect.id,
      note: effect.description,
      ...(types.length > 0 ? { types } : {}),
      ...(typeof config.magical === 'boolean' ? { magical: config.magical } : {}),
      ...(typeof config.silvered === 'boolean' ? { silvered: config.silvered } : {}),
      ...(typeof config.adamantine === 'boolean' ? { adamantine: config.adamantine } : {}),
      ...(sourceKind ? { sourceKind } : {}),
    };

    if (kind === 'resistance') set.resistances.push(entry);
    else if (kind === 'vulnerability') set.vulnerabilities.push(entry);
    else set.immunities.push(entry);
    if (effect.description && !set.notes.includes(effect.description)) {
      set.notes.push(effect.description);
    }
    found = true;
  }

  return found ? set : null;
}

export function getCombatantAffinities(
  combatant?: Combatant | null,
  recordId?: string
): DamageAffinitySet | null {
  if (!combatant) return null;

  let base: DamageAffinitySet | null = combatant.damageAffinities ?? null;
  if (!base) {
    let templateId = combatant.templateId;
    if (!templateId && recordId) {
      const record = combatStore.get(recordId);
      templateId = record?.combatants.find((item) => item.id === combatant.id)?.templateId;
    }
    if (templateId) {
      const template = npcTemplateStore.get(templateId);
      base = buildCombatantAffinities(template) ?? null;
    }
  }

  return mergeAffinitySets(base, buildStatusAffinities(combatant.id));
}
