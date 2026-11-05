// 施法法器（Spellcasting Focus）机制 —— 与材料袋同属「材料替代物」，但有两个额外约束：
//   1. 必须被至少一只手持握（材料袋只要在背包里即可）
//   2. 只有对应职业的法术能使用（法师/术士/魔契师/奥法骑士/诡术师 → 奥术法器，
//      吟游诗人 → 乐器，牧师/圣武士 → 圣徽，德鲁伊/游侠 → 德鲁伊法器）
// 分类完全依赖装备的分类标签：法器分类下的奥术法器 / 圣徽 / 德鲁伊法器子分类，
// 乐器则位于工具分类下的「乐器」子分类。不按名称猜测。
// 本模块为纯函数：不读写 store，不做副作用。
import type { Character, Equipment } from '@/types/character';

export type FocusKind = 'arcane' | 'druidic' | 'holy' | 'instrument';

export const FOCUS_KIND_LABEL: Record<FocusKind, string> = {
  arcane: '奥术法器',
  druidic: '德鲁伊法器',
  holy: '圣徽',
  instrument: '乐器',
};

const FOCUS_CATEGORY = '法器';
const TOOL_CATEGORY = '工具';
const INSTRUMENT_SUBTYPE = '乐器';
const POUCH_SUBTYPE = '材料袋';

const SUBTYPE_TO_KIND: Record<string, FocusKind> = {
  '奥术法器': 'arcane',
  '德鲁伊法器': 'druidic',
  '圣徽': 'holy',
  [INSTRUMENT_SUBTYPE]: 'instrument',
};

/** 装备可充当的法器类型：法器分类按子分类判定，工具分类只认「乐器」子分类 */
export function focusKindsOfItem(item: { category?: string; subtype?: string }): FocusKind[] {
  const subtype = item.subtype || '';
  // 材料袋属于法器分类，但它是材料包，走背包即可的替代路径，不算施法法器
  if (subtype === POUCH_SUBTYPE) return [];

  if (item.category === FOCUS_CATEGORY) {
    const kind = SUBTYPE_TO_KIND[subtype];
    return kind && kind !== 'instrument' ? [kind] : [];
  }
  if (item.category === TOOL_CATEGORY && subtype === INSTRUMENT_SUBTYPE) {
    return ['instrument'];
  }
  return [];
}

const CLASS_FOCUS_KINDS: Record<string, FocusKind[]> = {
  '法师': ['arcane'],
  '术士': ['arcane'],
  '魔契师': ['arcane'],
  '邪术师': ['arcane'],
  '吟游诗人': ['instrument'],
  '牧师': ['holy'],
  '圣武士': ['holy'],
  '德鲁伊': ['druidic'],
  '游侠': ['druidic'],
  Wizard: ['arcane'],
  Sorcerer: ['arcane'],
  Warlock: ['arcane'],
  Bard: ['instrument'],
  Cleric: ['holy'],
  Paladin: ['holy'],
  Druid: ['druidic'],
  Ranger: ['druidic'],
};

/** 子职追加的法器类型：奥法骑士 / 诡术师使用奥术法器 */
const SUBCLASS_FOCUS_KINDS: Record<string, FocusKind[]> = {
  '战士:eldritch_knight': ['arcane'],
  '游荡者:arcane_trickster': ['arcane'],
  '战士:奥法骑士': ['arcane'],
  '游荡者:诡术师': ['arcane'],
};

/** 角色职业与子职可使用哪些法器 */
export function allowedFocusKinds(character: Character | null | undefined): FocusKind[] {
  if (!character) return [];
  const className = character.profession?.class || (character as unknown as { class?: string }).class || '';
  const subclass = character.profession?.subclass || (character as unknown as { subclass?: string }).subclass || '';
  const kinds = new Set<FocusKind>(CLASS_FOCUS_KINDS[className] || []);
  for (const k of SUBCLASS_FOCUS_KINDS[`${className}:${subclass}`] || []) kinds.add(k);
  return [...kinds];
}

/**
 * 手持槽引用的装备 ID 集合（战斗层手持，挂在参战者上，进战时从角色卡备战槽初始化）。
 * holder 为 null（非战斗场景）返回 null，评估方按「跳过手持检查」处理——日常浏览视角
 * 手持只在战斗中有意义（D&D 材料部件的手持要求在战斗内由参战者手持槽判定）。
 */
export function getHeldEquipmentIds(
  holder: { heldLeft?: { equipmentId?: string | null }; heldRight?: { equipmentId?: string | null } } | null | undefined,
): string[] | null {
  if (!holder) return null;
  return [holder.heldLeft?.equipmentId, holder.heldRight?.equipmentId].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
}

function equipmentIdOf(item: Equipment): string {
  return item.childId || item.id || '';
}

/**
 * 该装备能否作为施法者的法器使用：
 *   - 分类/子分类命中法器
 *   - 手持槽中存在（至少单手握持）
 *   - 法器类型在角色职业允许范围内
 */
export function isUsableFocus(
  item: Equipment,
  character: Character | null | undefined,
  heldIds: string[] | null | undefined,
): boolean {
  const kinds = focusKindsOfItem(item);
  if (kinds.length === 0) return false;
  if (Array.isArray(heldIds)) {
    const id = equipmentIdOf(item);
    if (!id || !heldIds.includes(id)) return false;
  }
  const allowed = allowedFocusKinds(character);
  return kinds.some((k) => allowed.includes(k));
}

export type FocusIssue = 'not-held' | 'wrong-class';

export interface FocusDiagnosis {
  item: Equipment;
  kinds: FocusKind[];
  /** 该法器所在问题的原因 */
  issue: FocusIssue;
}

/**
 * 诊断背包中「像法器但不能用」的装备，用于提示 DM：要么没手持，要么职业不匹配。
 * 返回最贴近可用的一件（优先职业匹配但未手持，其次类型不匹配）。
 */
export function diagnoseFocus(
  inventory: Equipment[] | null | undefined,
  character: Character | null | undefined,
  heldIds: string[] | null | undefined,
): FocusDiagnosis | null {
  if (!inventory || !character) return null;
  const allowed = allowedFocusKinds(character);
  let notHeld: FocusDiagnosis | null = null;
  let wrongClass: FocusDiagnosis | null = null;

  for (const item of inventory) {
    const kinds = focusKindsOfItem(item);
    if (kinds.length === 0) continue;
    const id = equipmentIdOf(item);
    const held = !Array.isArray(heldIds) || (!!id && heldIds.includes(id));
    const classOk = kinds.some((k) => allowed.includes(k));
    if (!classOk) {
      wrongClass = wrongClass || { item, kinds, issue: 'wrong-class' };
      continue;
    }
    if (!held) {
      notHeld = notHeld || { item, kinds, issue: 'not-held' };
    }
  }
  return notHeld || wrongClass;
}

/** 展示用：该装备命中的法器类型标签 */
export function focusKindLabel(item: { category?: string; subtype?: string }): string {
  return focusKindsOfItem(item)
    .map((k) => FOCUS_KIND_LABEL[k])
    .join(' / ');
}
