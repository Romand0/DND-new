// src/data/equipmentFactory.ts

/**
 * 从任意源对象提取标准装备字段
 * 源对象可以是 EquipmentItem、formData、editingEquipment 等
 */
function extractBaseFields(source: {
  name?: string;
  category?: string;
  subtype?: string;
  weight?: number;
  price?: { amount: number; unit: 'gp' | 'sp' | 'cp' };
  damageDice?: string;
  damageType?: string;
  description?: string;
  properties?: string[];
  tags?: { key: string; value: string }[];
  source?: string;
}) {
  return {
    name: source.name || '',
    category: source.category || '杂项',
    subtype: source.subtype || '',
    weight: source.weight ?? 0,
    price: source.price || { amount: 0, unit: 'gp' },
    damageDice: source.damageDice || '',
    damageType: source.damageType || '',
    description: source.description || '',
    properties: source.properties || [],
    tags: source.tags || [],
    source: source.source || '',
  };
}
