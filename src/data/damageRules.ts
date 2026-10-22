// 伤害抗性 / 易伤 / 免疫的解析与结算（纯函数，无副作用）
// 规则顺序：免疫归零 → 抗性向下取整减半 → 易伤加倍
import {
  DAMAGE_TYPE_ALIASES,
  DAMAGE_TYPES,
  DAMAGE_TYPE_LABELS,
  type Affinity,
  type AffinityEntry,
  type AffinityKind,
  type AffinityRequirement,
  type DamageAffinitySet,
  type DamageComponentInput,
  type DamageComponentResult,
  type DamageResolution,
  type DamageSource,
  type DamageType,
  type RawDamageAffinities,
} from '@/types/damage';

const TYPE_TOKEN_SET = new Set<string>([...DAMAGE_TYPES, ...Object.keys(DAMAGE_TYPE_ALIASES)]);
const TYPE_TOKENS = Array.from(TYPE_TOKEN_SET).sort((a, b) => b.length - a.length);

const UNSUPPORTED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /由善良生物|由邪恶生物|由守序生物|由混乱生物/, reason: '限定生物阵营，无法自动判定' },
  { pattern: /由.*(生物|神明|神祇)的攻击造成/, reason: '限定攻击来源，无法自动判定' },
];

export function normalizeDamageType(raw?: string | null): DamageType | null {
  if (!raw) return null;
  const text = raw.trim().replace(/\s+/g, '');
  if (!text) return null;
  if (DAMAGE_TYPES.includes(text as DamageType)) return text as DamageType;
  return DAMAGE_TYPE_ALIASES[text] ?? null;
}

/** 从一段中文描述中提取标准伤害类型（长词优先，避免“光”抢先匹配“光耀”） */
export function extractDamageType(raw?: string | null): DamageType | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  for (const token of TYPE_TOKENS) {
    if (text.includes(token)) {
      return DAMAGE_TYPE_ALIASES[token] ?? (token as DamageType);
    }
  }
  return null;
}

function extractNotes(raw: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const text = raw
    .replace(/[（(]([^）)]*)[）)]/g, (_, inner: string) => {
      const note = inner.trim();
      if (note) notes.push(note);
      return '';
    })
    .trim();
  return { text, notes };
}

function splitEntries(raw: string): string[] {
  return raw
    .split(/[、，,;；。]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRequirement(text: string): AffinityRequirement {
  const requirement: AffinityRequirement = {};

  if (/法术伤害|法术造成的伤害|法术攻击/.test(text)) {
    requirement.types = [];
    requirement.sourceKind = 'spell';
  } else if (/所有伤害|任意伤害|任何伤害/.test(text)) {
    requirement.types = [];
  } else {
    const type = extractDamageType(text);
    if (type) {
      requirement.types = [type];
    } else if (/魔法武器|魔法攻击|非魔法/.test(text)) {
      requirement.types = [];
    }
  }

  if (/非魔法/.test(text)) {
    requirement.magical = false;
  } else if (/魔法武器/.test(text) && !/魔法攻击/.test(text)) {
    requirement.magical = true;
    requirement.sourceKind = 'weapon';
  } else if (/魔法攻击|魔法伤害/.test(text)) {
    requirement.magical = true;
  }

  if (/非镀银|非银质|非银制/.test(text)) {
    requirement.silvered = false;
  } else if (/镀银|银质|银制/.test(text)) {
    requirement.silvered = true;
  }

  if (/非精金/.test(text)) {
    requirement.adamantine = false;
  } else if (/精金/.test(text)) {
    requirement.adamantine = true;
  }

  return requirement;
}

function parseEntry(
  raw: string,
  kind: AffinityKind,
  index: number
): { entry?: AffinityEntry; issue?: { raw: string; reason: string }; note?: string } {
  const { text, notes } = extractNotes(raw);
  const note = notes.join('；') || undefined;

  const unsupported = UNSUPPORTED_PATTERNS.find(({ pattern }) => pattern.test(text));
  if (unsupported) {
    return { issue: { raw, reason: unsupported.reason } };
  }

  const requirement = buildRequirement(text);
  if (!requirement.types) {
    return { issue: { raw, reason: '无法识别伤害类型' } };
  }

  return {
    entry: {
      id: `aff-${kind}-${index}`,
      kind,
      raw,
      note,
      ...requirement,
    },
    note,
  };
}

/** 把 NPC 模板上的中文抗性数组解析成结构化快照 */
export function parseDamageAffinities(input?: RawDamageAffinities | null): DamageAffinitySet {
  const result: DamageAffinitySet = {
    resistances: [],
    vulnerabilities: [],
    immunities: [],
    notes: [...(input?.notes ?? [])],
    unsupported: [],
  };
  if (!input) return result;

  const groups: { raw?: string[] | null; kind: AffinityKind; target: AffinityEntry[] }[] = [
    { raw: input.resistances, kind: 'resistance', target: result.resistances },
    { raw: input.vulnerabilities, kind: 'vulnerability', target: result.vulnerabilities },
    { raw: input.immunities, kind: 'immunity', target: result.immunities },
  ];

  for (const group of groups) {
    for (const label of group.raw ?? []) {
      for (const item of splitEntries(label)) {
        const parsed = parseEntry(item, group.kind, group.target.length);
        if (parsed.entry) {
          group.target.push(parsed.entry);
          if (parsed.note && !result.notes.includes(parsed.note)) result.notes.push(parsed.note);
        } else if (parsed.issue) {
          result.unsupported.push(parsed.issue);
        }
      }
    }
  }

  return result;
}

export function matchesEntry(
  entry: AffinityEntry,
  type: DamageType | undefined,
  source: DamageSource
): boolean {
  if (entry.types && entry.types.length > 0) {
    if (!type || !entry.types.includes(type)) return false;
  }
  if (entry.sourceKind && entry.sourceKind !== source.kind) return false;
  if (entry.magical === true && !source.magical) return false;
  if (entry.magical === false && source.magical) return false;
  if (entry.silvered === true && !source.silvered) return false;
  if (entry.silvered === false && source.silvered) return false;
  if (entry.adamantine === true && !source.adamantine) return false;
  if (entry.adamantine === false && source.adamantine) return false;
  return true;
}

function collectMatched(
  entries: AffinityEntry[],
  type: DamageType | undefined,
  source: DamageSource
): AffinityEntry[] {
  return entries.filter((entry) => matchesEntry(entry, type, source));
}

/**
 * 唯一伤害结算入口。
 * 每个分量独立结算：免疫归零；抗性 Math.floor(x/2)；易伤 x2。
 * 同一类型同时有抗性和易伤时两者都生效（D&D 5e 规则），最终标记为 both。
 */
export function resolveDamage(
  parts: DamageComponentInput[],
  affinities: DamageAffinitySet | null | undefined,
  source: DamageSource
): DamageResolution {
  const set = affinities ?? {
    resistances: [],
    vulnerabilities: [],
    immunities: [],
    notes: [],
    unsupported: [],
  };

  const components: DamageComponentResult[] = parts.map((part) => {
    const base = Number.isFinite(part.amount) ? Math.max(0, Math.floor(part.amount)) : 0;
    const immunityMatches = collectMatched(set.immunities, part.type, source);
    const resistanceMatches = collectMatched(set.resistances, part.type, source);
    const vulnerabilityMatches = collectMatched(set.vulnerabilities, part.type, source);

    const hasImmunity = immunityMatches.length > 0;
    const hasResistance = resistanceMatches.length > 0;
    const hasVulnerability = vulnerabilityMatches.length > 0;

    let afterImmunity = base;
    let afterResistance = base;
    let final = base;

    if (hasImmunity) {
      afterImmunity = 0;
      afterResistance = 0;
      final = 0;
    } else {
      if (hasResistance) {
        afterResistance = Math.floor(base / 2);
      }
      final = afterResistance;
      if (hasVulnerability) {
        final = final * 2;
      }
    }

    let affinity: Affinity = 'none';
    if (hasImmunity) affinity = 'immunity';
    else if (hasResistance && hasVulnerability) affinity = 'both';
    else if (hasResistance) affinity = 'resistance';
    else if (hasVulnerability) affinity = 'vulnerability';

    return {
      type: part.type,
      base,
      afterImmunity,
      afterResistance,
      final,
      affinity,
      matched: [...immunityMatches, ...resistanceMatches, ...vulnerabilityMatches].map((e) => e.raw),
    };
  });

  const notes: string[] = [];
  for (const component of components) {
    for (const entry of [
      ...set.immunities,
      ...set.resistances,
      ...set.vulnerabilities,
    ]) {
      if (entry.note && component.matched.includes(entry.raw) && !notes.includes(entry.note)) {
        notes.push(entry.note);
      }
    }
  }

  return {
    base: components.reduce((sum, c) => sum + c.base, 0),
    final: components.reduce((sum, c) => sum + c.final, 0),
    components,
    notes,
    anyResisted: components.some((c) => c.affinity === 'resistance' || c.affinity === 'both'),
    anyImmune: components.some((c) => c.affinity === 'immunity'),
    anyVulnerable: components.some((c) => c.affinity === 'vulnerability' || c.affinity === 'both'),
  };
}

/** 未声明伤害类型时保持旧行为：数值原样通过，并提示 DM */
export function createUntypedResolution(amount: number, note = '未声明伤害类型，未应用抗性'): DamageResolution {
  const base = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  return {
    base,
    final: base,
    components: [
      {
        type: undefined,
        base,
        afterImmunity: base,
        afterResistance: base,
        final: base,
        affinity: 'none',
        matched: [],
      },
    ],
    notes: [note],
    anyResisted: false,
    anyImmune: false,
    anyVulnerable: false,
  };
}

/** 生成给日志/UI 看的抗性明细，例如“火焰 24→12（抗性）” */
export function formatDamageBreakdown(resolution: DamageResolution | null | undefined): string {
  if (!resolution) return '';
  return resolution.components
    .filter((component) => component.affinity !== 'none')
    .map((component) => {
      const label = component.type ? DAMAGE_TYPE_LABELS[component.type] : '伤害';
      const affinity =
        component.affinity === 'both'
          ? '抗性+易伤'
          : component.affinity === 'resistance'
            ? '抗性'
            : component.affinity === 'vulnerability'
              ? '易伤'
              : '免疫';
      return `${label} ${component.base}→${component.final}（${affinity}）`;
    })
    .join('；');
}

export interface AttackSourceLike {
  magical?: boolean;
  silvered?: boolean;
  adamantine?: boolean;
  note?: string;
  properties?: string[];
}

/** 从武器攻击的文本线索推断伤害来源（旧数据没有 magicCategory 时的兜底） */
export function inferWeaponDamageSource(attack: AttackSourceLike): DamageSource {
  const text = [attack.note ?? '', ...(attack.properties ?? [])].join(' ');
  const magicalText = /魔法(武器|攻击)/.test(text) && !/非魔法/.test(text);
  return {
    kind: 'weapon',
    magical: attack.magical ?? magicalText,
    silvered: attack.silvered ?? /镀银|银质|银制/.test(text),
    adamantine: attack.adamantine ?? /精金/.test(text),
  };
}

export function spellDamageSource(): DamageSource {
  return { kind: 'spell', magical: true };
}
