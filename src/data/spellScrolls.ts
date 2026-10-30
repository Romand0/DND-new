// 法术卷轴虚拟条目 —— 卷轴不进 D1，按法术库即时生成装备库条目
// 同一法术的卷轴条目 id 固定为 `scroll-<spellId>`，在 EquipmentList / EquipmentPicker 中作为真实条目展示，
// 但仅在「加入背包 / 加入宝藏」时物化为角色装备或宝藏条目，装备库本身不持久化这些条目。
import type { EquipmentItem } from '@/types/equipment';
import type { Spell } from '@/types/spell';
import { spellStore } from '@/data/spellStore';
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

export function isScrollEquipmentItem(item: { category?: string; scrollSpellId?: string }): boolean {
  return item.scrollSpellId != null || item.category === '卷轴';
}

/** 单个法术 → 卷轴装备库条目 */
export function buildScrollItem(spell: Spell): EquipmentItem {
  const level = typeof spell.level === 'number' ? spell.level : 0;
  const rarity = scrollRarity(level);
  return {
    id: scrollItemId(spell.id),
    name: `法术卷轴：${spell.name}`,
    category: '卷轴',
    subtype: '法术卷轴',
    weight: 0,
    price: { amount: scrollPriceGp(level), unit: 'gp' },
    description: `记录了《${spell.name}》（${level === 0 ? '戏法' : `${level} 环`}）的法术卷轴，稀有度${rarity}。持有者可消耗卷轴施放该法术。`,
    properties: [level === 0 ? '戏法' : `${level} 环`, spell.school, rarity].filter(Boolean),
    isCustom: false,
    tags: [],
    source: spell.source || '法术库',
    magicCategory: '魔法物品',
    tradeCategory: '冒险物品',
    rarity,
    scrollSpellId: spell.id,
    scrollSpellName: spell.name,
    scrollSpellLevel: level,
  };
}

/** 法术库 → 全部卷轴条目（按环级、名称排序） */
export function buildScrollItems(spells?: Spell[]): EquipmentItem[] {
  const source = spells ?? spellStore.getAll();
  return source
    .filter((s) => !!s && typeof s.name === 'string')
    .map(buildScrollItem)
    .sort((a, b) => {
      const la = a.scrollSpellLevel ?? 0;
      const lb = b.scrollSpellLevel ?? 0;
      if (la !== lb) return la - lb;
      return (a.scrollSpellName || '').localeCompare(b.scrollSpellName || '', 'zh-CN');
    });
}

/** 拉取法术库后生成全部卷轴条目；云端失败时回落到本地缓存 */
export async function loadScrollCatalog(): Promise<EquipmentItem[]> {
  try {
    const spells = await spellStore.fetchAll();
    return buildScrollItems(spells);
  } catch {
    return buildScrollItems(spellStore.getAll());
  }
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
