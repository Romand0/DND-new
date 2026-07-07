// DM Toolkit - Equipment Wear/Unwear Logic
import { characterStore } from './characterStore';
import type { Character } from '@/types/character';

/**
 * 兼容性矩阵：判断护甲是否允许与服装共存
 * 轻甲/胸甲/链甲衫 → 允许服装套在外面，服装作用可生效
 * 其他护甲 → 不允许
 */
function canWearWithOutfit(armorSubtype?: string): boolean {
  const compatibleTypes = ['轻甲', '胸甲', '链甲衫'];
  return armorSubtype ? compatibleTypes.includes(armorSubtype) : false;
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

  const category = equip.category;

  if (category !== '护甲' && category !== '服装') {
    return { success: false, message: '只有护甲和服装可以穿戴' };
  }

  if (category === '护甲') {
    if (char.wornArmorId) {
      return { success: false, message: '已穿戴护甲，请先卸下当前护甲' };
    }
    if (char.wornOutfitId) {
      const outfit = char.equipment.find((e) => e.id === char.wornOutfitId);
      if (outfit && !canWearWithOutfit(equip.subtype)) {
        return { success: false, message: '当前护甲类型不允许套在服装外面，请先卸下服装' };
      }
    }
    char.wornArmorId = equipId;
  }

  if (category === '服装') {
    if (char.wornOutfitId) {
      return { success: false, message: '已穿戴服装，请先卸下当前服装' };
    }
    if (char.wornArmorId) {
      const armor = char.equipment.find((e) => e.id === char.wornArmorId);
      if (armor && !canWearWithOutfit(armor.subtype)) {
        return { success: false, message: '当前护甲不允许套服装在外面，请先卸下护甲' };
      }
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

export { wearEquipment, unwearEquipment, canWearWithOutfit };
