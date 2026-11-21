import npcTemplateStore from '@/data/npcTemplateStore';
import type { NpcTemplate, Combatant, CreatureType, WildShapeState } from '@/types/combat';

/**
 * 荒野变形（德鲁伊 2 级战斗变形）引擎：
 *  - 数据源 = 怪物图鉴本地库（npcTemplateStore 种子基线，怪物/野兽.json），
 *    按 creatureType === 'beast' 过滤复用，零硬编码野兽数据；
 *  - 变身 = 参战者战斗形状按野兽模板整体替换（HP/AC/速度/六维/攻击/特性备注），
 *    原形快照存参战者 wildShape.snapshot，还原时回填；
 *  - 资源扣减（2 次/短休）按特性池体系在弹窗确认时由消费方结算。
 */

/** CR 文本转数值（'1/4' → 0.25、'0' → 0、'2' → 2）；解析失败返回 null（不过滤） */
function crToNumber(cr: string | undefined): number | null {
  if (!cr) return null;
  if (cr.includes('/')) {
    const [n, d] = cr.split('/').map(Number);
    if (Number.isFinite(n) && Number.isFinite(d) && d > 0) return n / d;
    return null;
  }
  const v = Number(cr);
  return Number.isFinite(v) ? v : null;
}

/**
 * 荒野变形候选野兽列表（图鉴野兽模板）。
 * maxCr 缺省 = 全量野兽（DM 手选）；传入数值时按模板 CR 过滤（5e：2 级 1/4 → 0.25）。
 * 排序：CR 升序 → 名称。
 */
export function listWildShapeBeasts(maxCr?: number): NpcTemplate[] {
  const beasts = npcTemplateStore.getAll().filter(t => t.creatureType === 'beast');
  const filtered = maxCr == null
    ? beasts
    : beasts.filter(t => {
        const cr = crToNumber(t.cr);
        return cr == null || cr <= maxCr;
      });
  return filtered.sort((a, b) => {
    const ca = crToNumber(a.cr) ?? Infinity;
    const cb = crToNumber(b.cr) ?? Infinity;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, 'zh');
  });
}

/**
 * 变身：参战者战斗形状按野兽模板整体替换，原形快照存 wildShape.snapshot。
 * PC 参战者六维平时从角色卡引用——变身写入野兽六维（NPC 形状字段），豁免计算改为
 * 读参战者自身字段；templateId 同步指向野兽模板（特性面板按 templateId 回读特质）。
 */
export function applyWildShapeForm(combatant: Combatant, beast: NpcTemplate): Combatant {
  const traitsText = (beast.traits ?? [])
    .map(t => `${t.name}：${t.text}`)
    .join('；');
  const note = combatant.note?.trim()
    ? `${combatant.note}｜野形特性：${traitsText || '无'}`
    : traitsText ? `野形特性：${traitsText}` : combatant.note;
  const shape: WildShapeState = {
    beastKey: beast.templateId,
    beastName: beast.name,
    snapshot: {
      name: combatant.name,
      currentHp: combatant.currentHp,
      maxHp: combatant.maxHp,
      ac: combatant.ac,
      attacks: combatant.attacks,
      speed: combatant.speed,
      creatureSize: combatant.creatureSize,
      creatureType: combatant.creatureType,
      templateId: combatant.templateId,
      note: combatant.note,
      strength: combatant.strength,
      dexterity: combatant.dexterity,
      constitution: combatant.constitution,
      intelligence: combatant.intelligence,
      wisdom: combatant.wisdom,
      charisma: combatant.charisma,
      proficiencyBonus: combatant.proficiencyBonus,
    },
  };
  return {
    ...combatant,
    name: `${combatant.name}·${beast.name}形`,
    currentHp: beast.maxHp,
    maxHp: beast.maxHp,
    ac: beast.ac,
    speed: beast.speed,
    attacks: (beast.attacks ?? []).map(a => ({ ...a })),
    creatureSize: beast.creatureSize,
    creatureType: 'beast' as CreatureType,
    templateId: beast.templateId,
    strength: beast.strength,
    dexterity: beast.dexterity,
    constitution: beast.constitution,
    intelligence: beast.intelligence,
    wisdom: beast.wisdom,
    charisma: beast.charisma,
    proficiencyBonus: beast.proficiencyBonus,
    note,
    wildShape: shape,
  };
}

/** 还原：快照字段显式回填（undefined 覆盖野兽六维 → JSON 落盘丢弃 → 恢复角色卡引用路径） */
export function restoreWildShapeForm(combatant: Combatant): Combatant {
  const shape = combatant.wildShape;
  if (!shape) return combatant;
  const snap = shape.snapshot;
  return {
    ...combatant,
    name: snap.name,
    currentHp: snap.currentHp,
    maxHp: snap.maxHp,
    ac: snap.ac,
    attacks: snap.attacks,
    speed: snap.speed,
    creatureSize: snap.creatureSize,
    creatureType: snap.creatureType,
    templateId: snap.templateId,
    note: snap.note,
    strength: snap.strength,
    dexterity: snap.dexterity,
    constitution: snap.constitution,
    intelligence: snap.intelligence,
    wisdom: snap.wisdom,
    charisma: snap.charisma,
    proficiencyBonus: snap.proficiencyBonus,
    wildShape: undefined,
  };
}
