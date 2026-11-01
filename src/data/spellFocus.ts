// 施法法器（Spellcasting Focus）机制 —— 与材料袋同属「材料替代物」，但有两个额外约束：
//   1. 必须被至少一只手持握（材料袋只要在背包里即可）
//   2. 只有对应职业的法术能使用（法师/术士/魔契师/奥法骑士/诡术师 → 奥术法器，
//      吟游诗人 → 乐器，牧师/圣武士 → 圣徽，德鲁伊/游侠 → 德鲁伊法器）
// 本模块为纯函数：不读写 store，不做副作用。
import type { Character, Equipment } from '@/types/character';

export type FocusKind = 'arcane' | 'druidic' | 'holy' | 'instrument';

export const FOCUS_KIND_LABEL: Record<FocusKind, string> = {
  arcane: '奥术法器',
  druidic: '德鲁伊法器',
  holy: '圣徽',
  instrument: '乐器',
};

/** 装备实例可充当的法器类型（一件物品可同时是多种，如木杖既是奥术法器也是德鲁伊法器） */
export function focusKindsOfItem(item: { category?: string; subtype?: string; name?: string }): FocusKind[] {
  const subtype = item.subtype || '';
  const name = item.name || '';
  const kinds = new Set<FocusKind>();

  if (subtype === '奥术法器') kinds.add('arcane');
  if (subtype === '德鲁伊法器') kinds.add('druidic');
  if (subtype === '圣徽') kinds.add('holy');
  if (subtype === '吟游诗人法器' || subtype === '乐器') kinds.add('instrument');

  // 名称兜底：装备库没有细分 subtype 时按常见法器名判定
  if (/圣徽|圣符|holy/i.test(name)) kinds.add('holy');
  if (/乐器|鲁特琴|笛|竖琴|号角|鼓|琵琶/i.test(name)) kinds.add('instrument');
  if (/水晶|法球|宝珠|权杖|魔杖|法杖|orb|crystal|wand|rod|staff/i.test(name)) {
    kinds.add('arcane');
    // 木杖在 5e 同时可作为德鲁伊法器
    if (/法杖|staff/i.test(name)) kinds.add('druidic');
  }

  // 仅「法器」分类或乐器类工具才算，避免普通杂物误判；材料袋走材料包逻辑，不算法器
  const isMaterialPouch = subtype === '材料袋' || /材料[包袋]/.test(name);
  const isFocusCategory = !isMaterialPouch
    && (item.category === '法器' || (item.category === '工具' && /乐器/.test(subtype + name)));
  return isFocusCategory ? [...kinds] : [];
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

/** 手持槽引用的装备 ID 集合（优先 childId，回退模板 id） */
export function getHeldEquipmentIds(character: Character | null | undefined): string[] {
  if (!character) return [];
  return [character.heldLeft?.equipmentId, character.heldRight?.equipmentId].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
}

function equipmentIdOf(item: Equipment): string {
  return item.childId || item.id || '';
}

/**
 * 该装备能否作为施法者的法器使用：
 *   - 分类/名称命中法器
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
export function focusKindLabel(item: { category?: string; subtype?: string; name?: string }): string {
  const kinds = focusKindsOfItem(item);
  return kinds.map((k) => FOCUS_KIND_LABEL[k]).join(' / ');
}
