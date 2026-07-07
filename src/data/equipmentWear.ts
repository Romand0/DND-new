// DM Toolkit - Equipment Wear/Unwear Logic
import { characterStore } from './characterStore';
import type { Character } from '@/types/character';

/** 判断装备是否可穿戴（护甲或服装） */
function isWearable(item: { category?: string; subtype?: string }): boolean {
  return item.category === '护甲' || (item.category === '杂项' && item.subtype === '服装');
}

/**
 * 兼容性矩阵：判断护甲是否允许服装效果生效
 * - 轻甲 → 全部允许
 * - 中甲 → 只有链甲衫、胸甲允许
 * - 重甲 → 不允许
 * 此函数仅用于 UI 提示，不阻止穿戴。
 */
function canWearWithOutfit(armor: { subtype?: string; name?: string }): boolean {
  if (armor.subtype === '轻甲') return true;
  if (armor.subtype === '中甲') {
    const compatibleNames = ['链甲衫', '胸甲'];
    return armor.name ? compatibleNames.includes(armor.name) : false;
  }
  return false;
}

/**
 * 穿戴装备
 * @param charId 角色 ID
 * @param equipId 装备 ID
 * @returns { success: boolean; message: string }
 */
function wearEquipment(charId: string, equipId: string): { success: boolean; message: string } {
  const char = characterStore.get(charId);
  if (!char) return { success: false, message: '角色不存在' };

  const equip = char.equipment.find((e) => e.id === equipId);
  if (!equip) return { success: false, message: '装备不存在' };

  if (!isWearable(equip)) {
    return { success: false, message: '只有护甲和服装可以穿戴' };
  }

  // 护甲槽：category === '护甲'
  if (equip.category === '护甲') {
    if (char.wornArmorId) {
      return { success: false, message: '已穿戴护甲，请先卸下当前护甲' };
    }
    char.wornArmorId = equipId;
  }

  // 服装槽：category === '杂项' && subtype === '服装'
  if (equip.category === '杂物' && equip.subtype === '服装') {
    if (char.wornOutfitId) {
      return { success: false, message: '已穿戴服装，请先卸下当前服装' };
    }
    char.wornOutfitId = equipId;
  }

  // 更新装备 tags
  const equipIndex = char.equipment.findIndex((e) => e.id === equipId);
  if (equipIndex !== -1) {
    const tags = char.equipment[equipIndex].tags || [];
    const existingIdx = tags.findIndex((t) => t.key === '着装状态');
    if (existingIdx >= 0) {
      tags[existingIdx].value = '已穿戴';
    } else {
      tags.push({ key: '着装状态', value: '已穿戴' });
    }
    char.equipment[equipIndex].tags = tags;
  }

  characterStore.save(char as Character);
  return { success: true, message: `${equip.name} 已穿戴` };
}

/**
 * 卸下装备
 * @param charId 角色 ID
 * @param equipId 装备 ID
 * @returns { success: boolean; message: string }
 */
function unwearEquipment(charId: string, equipId: string): { success: boolean; message: string } {
  const char = characterStore.get(charId);
  if (!char) return { success: false, message: '角色不存在' };

  const equip = char.equipment.find((e) => e.id === equipId);
  if (!equip) return { success: false, message: '装备不存在' };

  // 清除槽位
  if (char.wornArmorId === equipId) {
    char.wornArmorId = null;
  } else if (char.wornOutfitId === equipId) {
    char.wornOutfitId = null;
  } else {
    return { success: false, message: '该装备未穿戴' };
  }

  // 更新装备 tags
  const equipIndex = char.equipment.findIndex((e) => e.id === equipId);
  if (equipIndex !== -1) {
    const tags = char.equipment[equipIndex].tags || [];
    const existingIdx = tags.findIndex((t) => t.key === '着装状态');
    if (existingIdx >= 0) {
      tags[existingIdx].value = '未穿戴';
    }
    char.equipment[equipIndex].tags = tags;
  }

  characterStore.save(char as Character);
  return { success: true, message: `${equip.name} 已卸下` };
}

export { wearEquipment, unwearEquipment, canWearWithOutfit, isWearable };
