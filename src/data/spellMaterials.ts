import type { Spell, SpellMaterial } from '@/types/spell';
import type { Equipment } from '@/types/character';

/**
 * 法术材料机制（M 成分）
 *
 * 三层材料身份：
 *   1. 法术直接给出的材料（如「一小块羊毛」）—— 按 name 归一化为 materialKey，
 *      同类材料跨法术通用；以「法术材料」分类进入角色背包，与普通装备同构。
 *   2. 材料包（装备库预设，category='法器' subtype='材料袋'）—— 可替代绝大多数材料，
 *      但价值型（价值至少 X gp）与耗材型（作为耗材）材料不能被替代。
 *   3. 卷轴（category='卷轴'）—— 法术的附属施法凭证，按 scrollSpellId 与法术绑定；
 *      持有对应卷轴时材料成分整体满足，施放后卷轴消耗。
 *
 * 本模块为纯函数：不读写 store，不产生副作用，供战斗施法弹窗、角色卡、流程编译器共用。
 */

/** 单条材料需求 */
export interface MaterialRequirement {
  /** 归一化匹配键（跨法术共享） */
  key: string;
  /** 展示名（如「羊毛」） */
  name: string;
  /** 原文补充说明 */
  description?: string;
  /** 作为耗材：施放后消耗 1 份 */
  consumed?: boolean;
  /** 最低价值（gp）；>0 时材料包不可替代 */
  costGp?: number;
}

export type MaterialRequirementMode = 'any' | 'all';

export interface MaterialRequirementSet {
  items: MaterialRequirement[];
  /** any = 任选其一即可（原文用「或」「、」分隔）；all = 全部需要（原文用「和」连接） */
  mode: MaterialRequirementMode;
}

export type MaterialItemStatus = 'have' | 'pouch' | 'missing';

export interface MaterialEvaluation {
  /** 材料成分是否满足（卷轴视作整体满足） */
  satisfied: boolean;
  requirements: MaterialRequirementSet;
  statuses: { requirement: MaterialRequirement; status: MaterialItemStatus }[];
  /** 通过材料包满足 */
  viaPouch: boolean;
  /** 通过对应法术卷轴满足 */
  viaScroll: boolean;
  /** 需要消耗的背包实例（材料耗材 / 卷轴） */
  consumption: { childId: string; name: string; quantity: number }[];
  /** 缺失的材料（用于提示与快捷补货） */
  missing: MaterialRequirement[];
}

const POUCH_SUBTYPE = '材料袋';
const MATERIAL_CATEGORY = '法术材料';
const SCROLL_CATEGORY = '卷轴';

const CN_NUM = '一二三四五六七八九十两数几些若干';

/** 去掉量词前缀，抽出材料名词（「一小块羊毛」→「羊毛」） */
function stripMeasureWord(text: string): string {
  return text
    .replace(new RegExp(`^[\\s${CN_NUM}]+`), '')
    .replace(/^[小大]?[块撮颗片把根条张只个堆团瓶包袋份粒枚滴束卷]+/, '')
    .replace(/^[\s的]+/, '')
    .trim();
}

/** 去掉价值/耗材从句，避免污染匹配键 */
function stripCostClause(text: string): string {
  return text
    .replace(/价值\s*(?:至少|不低于)?\s*\d+\s*(?:gp|GP|金币)/g, '')
    .replace(/作为耗材/g, '')
    .replace(/^\s*[，,、]\s*/, '')
    .trim();
}

/** 材料展示名：剥离量词与价值/耗材从句（「一小块羊毛」→「羊毛」） */
function extractMaterialName(text: string): string {
  return stripMeasureWord(stripCostClause(stripMeasureWord(text)))
    .replace(/作为耗材/g, '')
    .replace(/[\s的，,、]+$/, '')
    .trim();
}

/** 归一化材料键：小写、去空白与标点 */
export function normalizeMaterialKey(name: string): string {
  return extractMaterialName(name)
    .toLowerCase()
    .replace(/[\s，,。.、；;：:！!？?（）()「」【】"'“”‘’]/g, '')
    .replace(/^的+/, '')
    .trim();
}

/** 从 materialInfo 文本解析价值与耗材标记 */
function parseCostAndConsumed(text: string): { costGp?: number; consumed?: boolean } {
  const costMatch = text.match(/价值\s*(?:至少|不低于)?\s*(\d+)\s*(?:gp|GP|金币)/);
  const costGp = costMatch ? Number(costMatch[1]) : undefined;
  const consumed = /作为耗材|耗材/.test(text);
  return {
    costGp: costGp && costGp > 0 ? costGp : undefined,
    consumed: consumed || undefined,
  };
}

function makeRequirement(raw: string): MaterialRequirement {
  const description = raw.trim();
  const pure = extractMaterialName(description);
  const key = normalizeMaterialKey(description);
  const { costGp, consumed } = parseCostAndConsumed(description);
  return {
    key: key || normalizeMaterialKey(pure) || 'material',
    name: pure || description,
    description,
    consumed,
    costGp,
  };
}

/**
 * 解析法术的材料需求：
 *   - 优先使用结构化 materials 字段（视为 all 模式）
 *   - 否则解析 materialInfo 文本：含「和」且不含「或」→ all；其余列表分隔 → any
 */
export function resolveMaterialRequirements(spell: Spell): MaterialRequirementSet {
  if (!spell.components?.material) return { items: [], mode: 'any' };

  if (Array.isArray(spell.materials) && spell.materials.length > 0) {
    const items = spell.materials.map((m: SpellMaterial) => ({
      key: m.id || normalizeMaterialKey(m.name),
      name: m.name,
      description: m.description,
      consumed: m.consumed || parseCostAndConsumed(m.name).consumed,
      costGp: (m.costGp && m.costGp > 0 ? m.costGp : parseCostAndConsumed(m.name).costGp),
    }));
    return { items, mode: 'all' };
  }

  const text = (spell.materialInfo || '').trim();
  if (!text) return { items: [], mode: 'any' };

  const hasAnd = /和|以及|与|及/.test(text);
  const hasOr = /或|、|，|,/.test(text);
  const mode: MaterialRequirementMode = hasAnd && !hasOr ? 'all' : 'any';
  const parts = mode === 'all'
    ? text.split(/以及|和|与|及/)
    : text.split(/[、，,或]/);

  const seen = new Set<string>();
  const items: MaterialRequirement[] = [];
  for (const part of parts) {
    const req = makeRequirement(part);
    if (!req.key || seen.has(req.key)) continue;
    seen.add(req.key);
    items.push(req);
  }
  return { items, mode };
}

/** 材料包能否替代该材料：价值型与耗材型不可替代 */
export function isPouchSubstitutable(req: MaterialRequirement): boolean {
  return !(req.costGp && req.costGp > 0) && !req.consumed;
}

function isMaterialItem(item: Equipment): boolean {
  return item.category === MATERIAL_CATEGORY
    || item.subtype === '法术材料'
    || !!item.materialKey;
}

function isPouch(item: Equipment): boolean {
  return item.category === '法器' && (item.subtype === POUCH_SUBTYPE || /材料[包袋]/.test(item.name || ''));
}

export function isScrollItem(item: Equipment): boolean {
  return item.category === SCROLL_CATEGORY || item.subtype === '法术卷轴' || !!item.scrollSpellId;
}

function itemKey(item: Equipment): string {
  return item.materialKey || normalizeMaterialKey(item.materialName || item.name || '');
}

/**
 * 评估法术材料是否满足。
 * @param inventory 施法者当前可用的战斗背包（含变更漏斗派生结果）
 */
export function evaluateSpellMaterials(spell: Spell, inventory: Equipment[] | null | undefined): MaterialEvaluation {
  const requirements = resolveMaterialRequirements(spell);
  const list = inventory || [];

  if (requirements.items.length === 0) {
    return {
      satisfied: true,
      requirements,
      statuses: [],
      viaPouch: false,
      viaScroll: false,
      consumption: [],
      missing: [],
    };
  }

  // 卷轴优先：对应法术卷轴视作整体满足，施放后卷轴消耗。
  // 优先按 scrollSpellId 绑定；手工从装备库加入的卷轴按 scrollSpellName / 名称包含法术名兜底匹配。
  const scroll = list.find((it) => {
    if (!isScrollItem(it)) return false;
    if (it.scrollSpellId === spell.id) return true;
    if (it.scrollSpellName && it.scrollSpellName === spell.name) return true;
    return !it.scrollSpellId && !!it.name && it.name.includes(spell.name);
  });
  if (scroll) {
    return {
      satisfied: true,
      requirements,
      statuses: requirements.items.map((requirement) => ({ requirement, status: 'have' as MaterialItemStatus })),
      viaPouch: false,
      viaScroll: true,
      consumption: [{ childId: (scroll.childId || scroll.id || ''), name: scroll.name, quantity: 1 }],
      missing: [],
    };
  }

  const hasPouch = list.some(isPouch);

  const statuses: MaterialEvaluation['statuses'] = [];
  const consumption: MaterialEvaluation['consumption'] = [];
  const missing: MaterialRequirement[] = [];

  for (const requirement of requirements.items) {
    // 匹配全背包：法术材料实例按 materialKey；普通装备按名称归一化（如自带「红宝石」）
    const matched = list.find((it) => {
      if (isScrollItem(it) || isPouch(it)) return false;
      if (itemKey(it) !== requirement.key) return false;
      // 价值型材料要求实例价值达标
      if (requirement.costGp && requirement.costGp > 0) {
        const value = it.materialCostGp ?? it.price?.amount ?? 0;
        if (value < requirement.costGp) return false;
      }
      return true;
    });

    if (matched) {
      statuses.push({ requirement, status: 'have' });
      if (requirement.consumed) {
        const childId = matched.childId || matched.id || '';
        if (childId) {
          consumption.push({ childId, name: matched.name, quantity: 1 });
        }
      } else if (matched.materialConsumed) {
        // 实例级耗材标记（如从耗材材料生成）
        const childId = matched.childId || matched.id || '';
        if (childId) consumption.push({ childId, name: matched.name, quantity: 1 });
      }
    } else if (hasPouch && isPouchSubstitutable(requirement)) {
      statuses.push({ requirement, status: 'pouch' });
    } else {
      statuses.push({ requirement, status: 'missing' });
      missing.push(requirement);
    }
  }

  const satisfied = requirements.mode === 'any'
    ? statuses.some((s) => s.status !== 'missing')
    : statuses.every((s) => s.status !== 'missing');

  return {
    satisfied,
    requirements,
    statuses,
    viaPouch: statuses.some((s) => s.status === 'pouch'),
    viaScroll: false,
    consumption: satisfied ? consumption : [],
    missing: satisfied ? [] : missing,
  };
}

/** 材料 → 角色背包装备（法术附属品，与普通装备同构） */
export function buildMaterialEquipment(spell: Spell, req: MaterialRequirement): Partial<Equipment> {
  return {
    id: `spell-material-${req.key}`,
    name: req.name,
    quantity: 1,
    category: MATERIAL_CATEGORY,
    subtype: '法术材料',
    weight: 0,
    price: req.costGp ? { amount: req.costGp, unit: 'gp' } : { amount: 0, unit: 'gp' },
    description: `法术材料：${req.description || req.name}${req.consumed ? '（作为耗材）' : ''}`,
    materialKey: req.key,
    materialName: req.name,
    materialSourceSpellId: spell.id,
    materialCostGp: req.costGp,
    materialConsumed: req.consumed,
    properties: [],
    tags: [],
  };
}

/** 法术卷轴 → 角色背包装备（施法凭证，施放对应法术后消耗） */
export function buildScrollEquipment(spell: Spell): Partial<Equipment> {
  const level = typeof spell.level === 'number' ? spell.level : 0;
  return {
    id: `spell-scroll-${spell.id}`,
    name: `法术卷轴：${spell.name}`,
    quantity: 1,
    category: SCROLL_CATEGORY,
    subtype: '法术卷轴',
    weight: 0,
    price: { amount: level === 0 ? 10 : 50 * level, unit: 'gp' },
    description: `记录了《${spell.name}》的法术卷轴，持有者可消耗卷轴施放该法术。`,
    scrollSpellId: spell.id,
    scrollSpellName: spell.name,
    scrollSpellLevel: level,
    properties: [],
    tags: [],
  };
}

/** 材料需求是否已完全满足（不含消耗副作用），供快捷补货按钮判断 */
export function isMaterialSatisfied(spell: Spell, inventory: Equipment[] | null | undefined): boolean {
  return evaluateSpellMaterials(spell, inventory).satisfied;
}
