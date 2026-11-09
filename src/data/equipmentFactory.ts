// src/data/equipmentFactory.ts
import type { EquipmentItem } from '@/types/equipment';
import { equipmentStore } from '@/data/equipmentStore';

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
    nameEn: source.nameEn,
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
    // 魔法物品专属属性：仅库存储，战斗消耗链后续接入
    attunement: source.attunement ?? false,
    attunePrereq: source.attunePrereq,
    magicBonus: source.magicBonus,
    charges: source.charges,
    chargeRegen: source.chargeRegen,
    cursed: source.cursed ?? false,
    activation: source.activation,
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

/**
 * 惰性补齐背包实例的魔法字段（存量迁移）：
 * 魔法字段上线前已加入背包的实例缺这组字段，按模板 id 回查装备库补齐。
 * 实例已带 rarity 视为字段齐全（魔法字段成组出现），跳过；非魔法模板查完仍为 undefined，无副作用。
 */
export function hydrateMagicFields<E extends { id?: string; rarity?: string }>(eq: E): E {
  if (!eq.id || eq.rarity !== undefined) return eq;
  const tpl = equipmentStore.getById(eq.id);
  if (!tpl) return eq;
  return {
    ...eq,
    nameEn: tpl.nameEn,
    rarity: tpl.rarity,
    attunement: tpl.attunement,
    attunePrereq: tpl.attunePrereq,
    magicBonus: tpl.magicBonus,
    charges: tpl.charges,
    chargeRegen: tpl.chargeRegen,
    cursed: tpl.cursed,
    activation: tpl.activation,
  };
}
