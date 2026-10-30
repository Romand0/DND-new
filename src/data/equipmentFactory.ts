// src/data/equipmentFactory.ts
import type { EquipmentItem } from '@/types/equipment';

/**
 * 从任意源对象提取标准装备字段
 * 源对象可以是 EquipmentItem、formData、editingEquipment 等
 * 返回值 = Omit<EquipmentItem, 'id' | 'isCustom'>，即装备库标准字段去掉 id/isCustom
 */
export function extractBaseFields(
  source: Partial<EquipmentItem>
): Omit<EquipmentItem, 'id' | 'isCustom'> {
  return {
    name: source.name ?? '',
    category: source.category ?? '杂项',
    subtype: source.subtype ?? '',
    weight: source.weight ?? 0,
    packSize: source.packSize,
    unit: source.unit,
    price: source.price?.amount != null
      ? source.price
      : { amount: 0, unit: 'gp' },
    damageDice: source.damageDice ?? '',
    damageType: source.damageType ?? '',
    acBase: source.acBase ?? '',
    strengthReq: source.strengthReq ?? 0,
    stealthDisadvantage: source.stealthDisadvantage ?? false,
    description: source.description ?? '',
    properties: source.properties ? [...source.properties] : [],
    tags: source.tags ? [...source.tags] : [],
    source: source.source ?? '',
    dataResource: source.dataResource ?? '',
    magicCategory: source.magicCategory ?? '非魔法物品',
    tradeCategory: source.tradeCategory ?? '冒险物品',
    rarity: source.rarity,
    // 法术附属品透传（卷轴 / 材料）：这些虚拟条目不属于装备库，但需要保留身份字段
    scrollSpellId: source.scrollSpellId,
    scrollSpellName: source.scrollSpellName,
    scrollSpellLevel: source.scrollSpellLevel,
    materialKey: source.materialKey,
    materialName: source.materialName,
    materialCostGp: source.materialCostGp,
    materialConsumed: source.materialConsumed,
  };
}
