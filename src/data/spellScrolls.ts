// 法术卷轴：由「法术卷轴」泛条目按需生成具体卷轴（复用 SpellPicker 选法术）。
// 不再按法术库全量投影——旧方案「有多少法术就有多少卷轴」冗余且淹没装备库。
// 泛条目本身是城主指南里的魔法物品「法术卷轴」，在装备选择器中被点击时触发选法术 → 生成绑定该法术的卷轴实例。
// 生成的具体卷轴 id 固定为 `scroll-<spellId>`，仅在加入背包 / 宝藏时物化为角色装备或宝藏条目。
import type { EquipmentItem } from '@/types/equipment';
import type { Spell } from '@/types/spell';
import type { Equipment } from '@/types/character';

/** 2024 玩家手册 / 城主指南：卷轴稀有度 */
export type ScrollRarity = '普通' | '非普通' | '珍稀' | '极珍稀' | '传说';

/** 环级 → 稀有度（0-1 普通 / 2-3 非普通 / 4-5 珍稀 / 6-8 极珍稀 / 9 传说） */
export function scrollRarity(level: number): ScrollRarity {
  const lv = Math.max(0, Math.min(9, Math.floor(level)));
  if (lv <= 1) return '普通';
  if (lv <= 3) return '非普通';
  if (lv <= 5) return '珍稀';
  if (lv <= 8) return '极珍稀';
  return '传说';
}

/** 环级 → 卷轴价值（gp），2024 DMG 价目表 */
const SCROLL_PRICE_BY_LEVEL: Record<number, number> = {
  0: 30,
  1: 50,
  2: 200,
  3: 300,
  4: 2000,
  5: 3000,
  6: 20000,
  7: 25000,
  8: 30000,
  9: 100000,
};

export function scrollPriceGp(level: number): number {
  const lv = Math.max(0, Math.min(9, Math.floor(level)));
  return SCROLL_PRICE_BY_LEVEL[lv] ?? 100000;
}

export function scrollItemId(spellId: string): string {
  return `scroll-${spellId}`;
}

/** 城主指南「法术卷轴」泛条目的种子 id（生成器入口） */
export const SPELL_SCROLL_TEMPLATE_ID = 'magic-法术卷轴';

/** 兜底模板：种子未加载 / 战斗内快速补货时使用，保证生成字段齐全；有真模板时以真模板为准 */
const FALLBACK_SCROLL_TEMPLATE: EquipmentItem = {
  id: SPELL_SCROLL_TEMPLATE_ID,
  name: '法术卷轴',
  category: '卷轴',
  subtype: '卷轴',
  weight: 0,
  price: { amount: 0, unit: 'gp' },
  description: '',
  isCustom: false,
  tags: [],
  source: '城主指南 2014',
  magicCategory: '魔法物品',
  tradeCategory: '冒险物品',
  rarity: '多种稀有度',
};

/** 判定是否为「法术卷轴」泛条目（生成器入口）：点击它应弹出 SpellPicker 而非直接加入 */
export function isSpellScrollTemplate(item: {
  id?: string;
  name?: string;
  category?: string;
  subtype?: string;
  scrollSpellId?: string;
}): boolean {
  if (item.scrollSpellId) return false; // 已绑定法术的具体卷轴，不再是模板
  if (item.id === SPELL_SCROLL_TEMPLATE_ID) return true;
  return item.name === '法术卷轴' && item.category === '卷轴';
}

export function isScrollEquipmentItem(item: { category?: string; scrollSpellId?: string }): boolean {
  return item.scrollSpellId != null || item.category === '卷轴';
}

/** 单个法术 → 卷轴装备库条目（无模板上下文时用兜底模板） */
export function buildScrollItem(spell: Spell): EquipmentItem {
  return buildScrollFromTemplate(FALLBACK_SCROLL_TEMPLATE, spell);
}

/**
 * 以泛条目为模板生成一把绑定具体法术的卷轴：
 * 继承模板的分类/来源/魔法标记等身份字段，法术环级决定名称、稀有度与价格。
 * 这样「城主指南」条目的文案/元数据仍是唯一事实源，法术只提供可变部分。
 */
export function buildScrollFromTemplate(template: EquipmentItem, spell: Spell): EquipmentItem {
  const level = typeof spell.level === 'number' ? spell.level : 0;
  const rarity = scrollRarity(level);
  return {
    ...template,
    id: scrollItemId(spell.id),
    name: `法术卷轴：${spell.name}`,
    nameEn: template.nameEn,
    category: '卷轴',
    subtype: '法术卷轴',
    weight: template.weight ?? 0,
    price: { amount: scrollPriceGp(level), unit: 'gp' },
    description: `记录了《${spell.name}》（${level === 0 ? '戏法' : `${level} 环`}）的法术卷轴，稀有度${rarity}。持有者可消耗卷轴施放该法术。`,
    properties: [level === 0 ? '戏法' : `${level} 环`, spell.school, rarity].filter(Boolean),
    isCustom: false,
    tags: [],
    source: spell.source || template.source || '法术库',
    magicCategory: '魔法物品',
    tradeCategory: '冒险物品',
    rarity,
    scrollSpellId: spell.id,
    scrollSpellName: spell.name,
    scrollSpellLevel: level,
  };
}

/** 卷轴条目 → 角色背包 Equipment（物化） */
export function scrollItemToEquipment(item: EquipmentItem, quantity = 1): Partial<Equipment> {
  return {
    id: item.id,
    name: item.name,
    quantity,
    category: item.category,
    subtype: item.subtype,
    weight: item.weight,
    price: item.price as { amount: number; unit: 'gp' },
    description: item.description,
    properties: item.properties,
    tags: item.tags,
    magicCategory: item.magicCategory,
    rarity: item.rarity,
    scrollSpellId: item.scrollSpellId,
    scrollSpellName: item.scrollSpellName,
    scrollSpellLevel: item.scrollSpellLevel,
  };
}
