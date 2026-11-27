// 弹药识别与双手握持判定（图鉴武器名/子类 → 弹药名，战斗弹窗与手持判定共用）。
// 种子里的弹药条目叫「箭」（不是「箭矢」），魔法弓的子类才是「长弓」——
// 单靠武器名精确匹配会漏掉这两类，导致「背包有箭却提示无弹药」。

export interface AmmoWeaponLike {
  name?: string;
  subtype?: string;
  properties?: string[];
}

interface AmmoRule {
  matches: (text: string) => boolean;
  ammo: string[];
}

// 顺序即优先级：先按武器名/子类关键词归类，避免「弩矢」类弹药条目被当成弩
const AMMO_RULES: AmmoRule[] = [
  { matches: (t) => t.includes('短弓') || t.includes('长弓') || t.endsWith('弓'), ammo: ['箭矢', '箭', 'Arrows'] },
  { matches: (t) => t.includes('弩'), ammo: ['弩矢', 'Bolts'] },
  { matches: (t) => t.includes('投石索'), ammo: ['投石索弹丸', 'Sling Bullets'] },
  { matches: (t) => t.includes('吹箭筒'), ammo: ['吹箭针', '吹箭', 'Blowgun Needles'] },
];

/** 武器名/子类 → 对应弹药名候选（中英文别名都列；无匹配返回空数组） */
export function getAmmoNames(weapon: AmmoWeaponLike): string[] {
  const name = (weapon.name ?? '').trim();
  const subtype = (weapon.subtype ?? '').trim();
  for (const rule of AMMO_RULES) {
    if ((name && rule.matches(name)) || (subtype && rule.matches(subtype))) return rule.ammo;
  }
  return [];
}

/** 装备名归一：去空白、去尾部「（20支）」注记与「x20」计数，便于宽松匹配 */
export function normalizeEquipmentName(name: string): string {
  return (name ?? '')
    .replace(/\s+/g, '')
    .replace(/[（(][^）)]*[）)]$/g, '')
    .replace(/[×xX*]\s*\d+$/g, '');
}

/** 装备名是否命中弹药候选（容忍「箭（20支）」「箭×20」这类写法） */
export function matchesAmmoName(equipmentName: string, ammoNames: string[]): boolean {
  if (ammoNames.length === 0) return false;
  const normalized = normalizeEquipmentName(equipmentName);
  return ammoNames.some((ammo) => normalizeEquipmentName(ammo) === normalized);
}

/** 是否带弹药属性（与投掷互斥由调用方按需处理） */
export function hasAmmoProperty(weapon: AmmoWeaponLike): boolean {
  return !!weapon.properties?.some((p) => p.includes('弹药'));
}

/**
 * 双手握持是否满足：
 * 1) 两槽都是同一把武器；或
 * 2) 弹药武器时，另一手持对应弹药（弹药不占「双持同一把武器」的槽位，
 *    否则弓+箭的常见摆法会被判成「未双手握持」）
 */
export function isTwoHandedGripOk(
  weapon: AmmoWeaponLike,
  bothHandsSameWeapon: boolean,
  otherItemName: string | null,
): boolean {
  if (bothHandsSameWeapon) return true;
  if (!hasAmmoProperty(weapon)) return false;
  if (!otherItemName) return false;
  return matchesAmmoName(otherItemName, getAmmoNames(weapon));
}
