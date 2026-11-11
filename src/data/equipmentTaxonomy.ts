// 装备库三层分类标准（EquipmentList / EquipmentPicker 共用）
//
// 第一级：魔法 / 非魔法 —— 最基础的二分，决定第二、三级显示哪些筛选维度。
// 第二级：
//   ① 魔法「品类」（武器/护甲/法杖/魔杖/权杖/卷轴/药水/奇物/戒指）—— 由 category+subtype 派生；
//      非魔法「功能」（武器/护甲/工具/法器/杂物）—— 沿用 category，药水并入杂物。
//   ② 魔法「稀有度」
//   ③ 非魔法「交易」（冒险物品 / 贵重物品）—— 魔法物品不参与，唯一特例是治疗药水
//      在城主指南中为魔法物品、在玩家手册中亦属冒险物品，故可在冒险物品下检索到。
// 第三级：子分类（武器近战/远程、护甲甲型、工具类别、法器类别）—— 全部属于非魔法领域。
//
// 识别逻辑与数据字段解耦：选项从实际条目集合动态派生（以库中现有分类为准），
// 纯函数供两个组件复用，避免各自硬编码分类导致漂移。
import type { EquipmentItem } from '@/types/equipment';

export type MagicKind = '魔法物品' | '非魔法物品';

/** 完整筛选状态（List 用；Picker 复用同一形状，只是省略不相关维度） */
export interface EquipmentFilters {
  /** 第一级：魔法 / 非魔法（空数组 = 不限） */
  magicKinds: string[];
  /** 魔法品类（'全部' = 不限） */
  magicCategory: string;
  /** 魔法稀有度多选 */
  rarity: string[];
  /** 非魔法功能（'全部' = 不限） */
  functionCategory: string;
  /** 非魔法交易多选 */
  trade: string[];
  /** 非魔法子分类多选 */
  subcategories: string[];
  /** 文本搜索（名称/描述/分类） */
  search: string;
}

export const MAGIC_KIND_OPTIONS: MagicKind[] = ['魔法物品', '非魔法物品'];

/** 魔法品类展示顺序 */
const MAGIC_CATEGORY_ORDER = ['武器', '护甲', '法杖', '魔杖', '权杖', '卷轴', '药水', '奇物', '戒指'];
/** 稀有度展示顺序 */
const RARITY_ORDER = ['普通', '非普通', '珍稀', '极珍稀', '传说', '多种稀有度', '特殊'];
/** 非魔法功能展示顺序 */
const FUNCTION_ORDER = ['武器', '护甲', '工具', '法器', '杂物'];
export const TRADE_OPTIONS = ['冒险物品', '贵重物品'];

/** 非魔法子分类映射（第三级，仅非魔法领域） */
export const SUBCATEGORY_MAP: Record<string, string[]> = {
  '武器': ['军用近战', '军用远程', '简易近战', '简易远程'],
  '护甲': ['轻甲', '中甲', '重甲', '盾牌'],
  '工具': ['工匠工具', '赌具', '乐器'],
  '法器': ['奥术法器', '德鲁伊法器', '圣徽', '材料袋'],
};

export function isMagicItem(item: Pick<EquipmentItem, 'magicCategory'>): boolean {
  return (item.magicCategory ?? '非魔法物品') === '魔法物品';
}

/**
 * 魔法品类：法器/杂物按其 subtype（法杖/魔杖/权杖、奇物/戒指）拆分为独立品类，
 * 其余沿用 category。这正是「很多魔法物品难以按功能对号入座」后需要的魔法专属口径。
 */
export function magicCategoryLabel(item: Pick<EquipmentItem, 'category' | 'subtype'>): string {
  const cat = item.category ?? '';
  const sub = (item.subtype ?? '').trim();
  if (cat === '法器' || cat === '杂物') return sub || cat;
  return cat;
}

/** 非魔法功能：药水在非魔法领域太少，统一并入杂物 */
export function functionCategoryLabel(item: Pick<EquipmentItem, 'category'>): string {
  return item.category === '药水' ? '杂物' : (item.category ?? '杂物');
}

/** 治疗药水特例：城主指南记为魔法物品，但同时是玩家手册的冒险物品 */
export function isHealingPotion(item: Pick<EquipmentItem, 'name'>): boolean {
  return (item.name ?? '').includes('治疗药水');
}

/**
 * 交易筛选：非魔法按 tradeCategory（缺省冒险物品）；魔法一律不参与，
 * 唯治疗药水可在「冒险物品」下命中。
 */
function matchTrade(item: EquipmentItem, trade: string[]): boolean {
  if (trade.length === 0) return true;
  if (isMagicItem(item)) {
    return isHealingPotion(item) && trade.includes('冒险物品');
  }
  return trade.includes(item.tradeCategory ?? '冒险物品');
}

/** 主筛选：按当前分类标准判断条目是否命中 */
export function matchesEquipmentFilters(item: EquipmentItem, f: EquipmentFilters): boolean {
  const magic = isMagicItem(item);

  if (f.magicKinds.length > 0 && !f.magicKinds.includes(magic ? '魔法物品' : '非魔法物品')) {
    return false;
  }

  if (magic) {
    if (f.magicCategory !== '全部' && magicCategoryLabel(item) !== f.magicCategory) return false;
    if (f.rarity.length > 0 && !f.rarity.includes(item.rarity ?? '')) return false;
  } else {
    if (f.functionCategory !== '全部' && functionCategoryLabel(item) !== f.functionCategory) return false;
    if (f.subcategories.length > 0 && !f.subcategories.some((s) => item.subtype?.includes(s))) return false;
  }

  // 交易筛选对两个领域都生效：非魔法正常比对，魔法仅治疗药水放行
  if (!matchTrade(item, f.trade)) return false;

  if (f.search) {
    const q = f.search.toLowerCase();
    const hit =
      item.name.toLowerCase().includes(q) ||
      (item.description ?? '').toLowerCase().includes(q) ||
      (item.category ?? '').toLowerCase().includes(q);
    if (!hit) return false;
  }

  return true;
}

/** 从实际条目派生魔法品类选项（以库中现有分类为准） */
export function magicCategoryOptions(items: EquipmentItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (isMagicItem(it)) set.add(magicCategoryLabel(it));
  return [
    ...MAGIC_CATEGORY_ORDER.filter((c) => set.has(c)),
    ...[...set].filter((c) => !MAGIC_CATEGORY_ORDER.includes(c)),
  ];
}

/** 从实际条目派生稀有度选项 */
export function rarityOptions(items: EquipmentItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (isMagicItem(it) && it.rarity) set.add(it.rarity);
  return [
    ...RARITY_ORDER.filter((r) => set.has(r)),
    ...[...set].filter((r) => !RARITY_ORDER.includes(r)),
  ];
}

/** 从实际条目派生非魔法功能选项 */
export function functionCategoryOptions(items: EquipmentItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (!isMagicItem(it)) set.add(functionCategoryLabel(it));
  return [
    ...FUNCTION_ORDER.filter((c) => set.has(c)),
    ...[...set].filter((c) => !FUNCTION_ORDER.includes(c)),
  ];
}

/** 分类排序权重（跨魔法/非魔法统一，用于列表稳定排序） */
export const TAXONOMY_CATEGORY_ORDER = [
  '武器', '护甲', '法杖', '魔杖', '权杖', '卷轴', '药水', '法器', '奇物', '戒指', '工具', '杂物',
];

export function emptyEquipmentFilters(): EquipmentFilters {
  return {
    magicKinds: [],
    magicCategory: '全部',
    rarity: [],
    functionCategory: '全部',
    trade: [],
    subcategories: [],
    search: '',
  };
}
