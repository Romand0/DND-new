import type { Combatant, CombatRecord, RoundAction, EquipmentChanges, TurnTodo, PendingAdvantageSource, PendingCheckModifier, OperationLogEntry, SettlementPreview, SettlementEntry, SettlementSelections } from '@/types/combat';
import { scopedKey } from '@/data/campaignScope';
import { syncListDiff, pullArtifactsOnce, mergeByIdentity } from '@/data/artifactSync';
import type { CastStepLog } from '@/types/castStep';
import { characterStore } from './characterStore';
import { equipmentStore } from './equipmentStore';
import { globalStatusManager } from './statusManager';
import type { Equipment, Character, SpellSlotLevel, HandSlot, HandState } from '@/types/character';
import type { StatusInstance } from '@/types/status';
import statusLibrary from './statusLibrary';

const storageKey = () => scopedKey('dnd-combat-records');
type Listener = () => void;

// =======================
// 内部状态（绝不暴露给外部）
// =======================
let listeners: Listener[] = [];

// 进程内缓存：避免每次读都全量 parse localStorage。
// 所有写操作都必须经过 save()，否则缓存不会失效。
let recordsCache: CombatRecord[] | null = null;

// 跨标签页一致性：其它标签页写入 localStorage 后，让本页缓存失效
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey()) recordsCache = null;
  });
}

function notify(): void {
  listeners.forEach(listener => listener());
}

/**
 * 空变更信息（每次操作前确保有默认值）
 */
export function emptyEquipmentChanges(): EquipmentChanges {
  return { added: [], removedChildIds: [], quantityDeltas: {} };
}

/**
 * 每个 childId 的净变化量信息（内部派生用）
 */
export interface ChildQtyInfo {
  /** 源背包中的数量（角色源装备）；无则 0 */
  srcQty: number;
  /** 战斗背包中最终数量（≥0，不允许负数） */
  combatQty: number;
  /** 源装备对象（若源背包中存在） */
  srcEq?: Equipment;
  /** 战斗中新增时的装备快照（added 项，source 中不存在的新物品） */
  addedEq?: Equipment;
}

/**
 * 计算每个 childId 的净变化量（combatQty vs srcQty）。
 *   - added / removedChildIds / quantityDeltas 三者彼此抵消、合并
 *   - removedChildIds：把该 childId 战斗中数量直接置 0（整件移除）
 *   - quantityDeltas：在 combatQty 基础上±数量
 *   - added：新增物品的初始数量（含 equipment.quantity）
 *   - 保证 combatQty ≥ 0（负数截断为 0）
 * 返回 Map<childId, ChildQtyInfo>
 */
export function computeChildQtyMap(
  character: Character | null | undefined,
  changes?: EquipmentChanges | null,
): Map<string, ChildQtyInfo> {
  const map = new Map<string, ChildQtyInfo>();
  const source: Equipment[] = (character?.equipment as Equipment[] | undefined) || [];
  const removedSet = new Set(changes?.removedChildIds || []);
  const qtyDeltas = changes?.quantityDeltas || {};
  const addedList = changes?.added || [];

  // 1. 源装备初始化：srcQty = 原始数量，combatQty = 原始数量
  for (const rawEq of source) {
    const cid = rawEq.childId || rawEq.id;
    if (!cid) continue;
    const q = (rawEq.quantity ?? 1);
    map.set(cid, { srcQty: q, combatQty: q, srcEq: { ...rawEq } });
  }

  // 2. 应用 added：新增物品（源里没有的，或源里也有的则数量叠加进入 combatQty，新增快照保留）
  //    added 项合并：同一 childId 出现多次时数量叠加，合并取最后一次快照对象
  const addedMergeMap = new Map<string, { equipment: Record<string, unknown>; qty: number }>();
  for (const a of addedList) {
    const prev = addedMergeMap.get(a.childId);
    const data = (a.equipment || {}) as Partial<Equipment>;
    const addQty = Math.max(1, (data.quantity as number) ?? 1);
    addedMergeMap.set(a.childId, {
      equipment: prev ? { ...prev.equipment, ...a.equipment } : a.equipment,
      qty: prev ? prev.qty + addQty : addQty,
    });
  }
  for (const [cid, ent] of addedMergeMap) {
    const data = (ent.equipment || {}) as Partial<Equipment>;
    const addedEq: Equipment = {
      ...(data as any),
      id: (data.id as string) || cid,
      childId: cid,
      name: (data.name as string) || '未命名物品',
      quantity: ent.qty,
      category: (data.category as string) || '杂项',
    };
    if (!addedEq.name) addedEq.name = '未命名物品';
    if (!addedEq.quantity || addedEq.quantity <= 0) addedEq.quantity = 1;

    const ex = map.get(cid);
    if (ex) {
      // 源里存在该 childId（罕见但允许）：combatQty 叠加 added 数量
      ex.combatQty += ent.qty;
      ex.addedEq = addedEq;
    } else {
      map.set(cid, { srcQty: 0, combatQty: ent.qty, addedEq });
    }
  }

  // 3. 应用 quantityDeltas：combatQty 增减
  for (const [cid, delta] of Object.entries(qtyDeltas)) {
    if (!delta) continue;
    const deltaNum = Number(delta);
    if (isNaN(deltaNum)) continue;
    const ex = map.get(cid);
    if (ex) {
      ex.combatQty += deltaNum;
    } else {
      // 未知 childId：按 srcQty=0 处理，delta 后 combatQty = delta（允许 added 后被 delta 改变量时触发）
      map.set(cid, { srcQty: 0, combatQty: deltaNum });
    }
  }

  // 4. 应用 removedChildIds：整件移除 → combatQty = 0
  for (const cid of removedSet) {
    const ex = map.get(cid);
    if (ex) {
      ex.combatQty = 0;
    } else {
      map.set(cid, { srcQty: 0, combatQty: 0 });
    }
  }

  // 5. 保证 combatQty ≥ 0
  for (const info of map.values()) {
    if (info.combatQty < 0) info.combatQty = 0;
  }

  return map;
}

/**
 * 计算净变化量视图（供变更信息弹窗展示）：
 *   delta = combatQty - srcQty
 *   - delta > 0：获得了 delta 件
 *   - delta < 0：失去了 |delta| 件
 *   - delta = 0：不返回（无变化）
 * 返回按 delta 正负分类的条目列表
 */
export interface NetChangeEntry {
  childId: string;
  name: string;
  delta: number; // 正数=获得，负数=失去
  combatQty: number;
  srcQty: number;
  info: ChildQtyInfo;
}
export function computeNetChanges(
  character: Character | null | undefined,
  changes?: EquipmentChanges | null,
): NetChangeEntry[] {
  const map = computeChildQtyMap(character, changes);
  const entries: NetChangeEntry[] = [];
  for (const [cid, info] of map) {
    const delta = info.combatQty - info.srcQty;
    if (delta === 0) continue;
    const name =
      info.srcEq?.name
      || info.addedEq?.name
      || '未知物品';
    entries.push({ childId: cid, name, delta, combatQty: info.combatQty, srcQty: info.srcQty, info });
  }
  return entries;
}

/**
 * 整理背包排序（与角色背包"整理背包"逻辑一致）：
 *   按分类顺序 ['武器','护甲','法器','工具','药水','杂物'] 排序，
 *   同分类内按名称 localeCompare 排序。
 *   每个不同 childId 的装备都是独立的，**不合并**。
 */
export function sortInventory(list: Equipment[]): Equipment[] {
  const categoryOrder = ['武器', '护甲', '法器', '工具', '药水', '法术材料', '卷轴', '杂物'];
  return [...list].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a.category || '');
    const bIndex = categoryOrder.indexOf(b.category || '');
    const aRank = aIndex === -1 ? categoryOrder.length : aIndex;
    const bRank = bIndex === -1 ? categoryOrder.length : bIndex;
    if (aRank !== bRank) return aRank - bRank;
    return (a.name || '').localeCompare(b.name || '', 'zh-CN');
  });
}

/**
 * 基于净变化量派生战斗背包（未排序版本）：
 *   使用 computeChildQtyMap 统一处理 added/removedChildIds/quantityDeltas
 *   保证 combatQty ≥ 0（不允许负数）
 */
function deriveFromChildQtyMap(
  map: Map<string, ChildQtyInfo>,
): Equipment[] {
  const result: Equipment[] = [];
  for (const info of map.values()) {
    if (info.combatQty <= 0) continue; // 战斗中数量为 0 → 不进战斗背包
    // 源里有优先用源装备对象（保留角色源属性），否则用 added 的快照
    const base = info.srcEq ?? info.addedEq;
    if (!base) continue;
    result.push({ ...base, quantity: info.combatQty });
  }
  return result;
}

/**
 * 派生战斗背包：
 *   战斗背包 = 角色背包（源） + 变更漏斗（added/removedChildIds/quantityDeltas 彼此抵消） + 自动整理
 *   三者按 childId 统一抵消后派生（见 computeChildQtyMap）。
 *   结果自动整理（排序，不合并，每个 childId 独立）。
 */
export function deriveCombatInventory(
  character: Character | null | undefined,
  changes?: EquipmentChanges | null,
): Equipment[] {
  const map = computeChildQtyMap(character, changes);
  return sortInventory(deriveFromChildQtyMap(map));
}

/**
 * 派生战斗背包（未排序版本）：
 *   与 deriveCombatInventory 相同，但**不做排序**。
 *   用于需要精确 childId 的场景（如投掷消耗：必须找到具体的 childId 才能正确移除）。
 */
export function deriveCombatInventoryRaw(
  character: Character | null | undefined,
  changes?: EquipmentChanges | null,
): Equipment[] {
  const map = computeChildQtyMap(character, changes);
  return deriveFromChildQtyMap(map); // 不排序
}

/**
 * 便捷函数：从战斗记录 + combatantId 计算出战斗背包（未排序）。
 */
export function getCombatInventoryRaw(
  record: CombatRecord | null | undefined,
  combatant: Combatant | null | undefined,
): Equipment[] {
  if (!record || !combatant) return [];
  const changes = record.equipmentChanges?.[combatant.id];
  let character: Character | null = null;
  if (combatant.characterId) character = characterStore.get(combatant.characterId);
  return deriveCombatInventoryRaw(character, changes);
}

/**
 * 便捷函数：从战斗记录 + combatantId 计算出战斗背包。
 * 若 combatant 是 PC（有 characterId），则从 characterStore 取源。
 * NPC 没有 character.equipment，因此战斗背包 = added 中新增的物品。
 */
export function getCombatInventory(
  record: CombatRecord | null | undefined,
  combatant: Combatant | null | undefined,
): Equipment[] {
  if (!record || !combatant) return [];
  const changes = record.equipmentChanges?.[combatant.id];
  let character: Character | null = null;
  if (combatant.characterId) character = characterStore.get(combatant.characterId);
  return deriveCombatInventory(character, changes);
}

/**
 * 基于战斗背包实际存在的装备，重算 PC 的 AC。
 *   - 不在战斗背包中的护甲/服装/盾牌**不参与加值**（贯彻用户要求）
 *   - NPC 或无 characterId 时返回 combatant.ac 原值
 * 算法对齐 recalculateArmorClass，但 source = 战斗背包：
 *   1. 基础：10 + 敏捷调整值
 *   2. 护甲（wornArmorId 在战斗背包）：
 *        - 重甲：AC = 基础护甲值
 *        - 中甲：基础护甲值 + 最小(敏捷调整值, 2)
 *        - 轻甲：基础护甲值 + 敏捷调整值
 *   3. 服装（wornOutfitId 在战斗背包）：仅影响"无护甲则用服装"
 *   4. 盾牌（heldLeft/Right.equipmentId 在战斗背包且 subtype === '盾牌'）：+2
 */
export function computeCombatantAc(
  combatant: Combatant,
  character: Character | null | undefined,
  combatInventory?: Equipment[] | null,
): number {
  // NPC：直接返回 combatant.ac
  if (!character || !combatant.isPc) return combatant.ac ?? 0;
  const inventory = combatInventory ?? character.equipment as Equipment[] | undefined ?? [];
  const dex = character.abilities?.dexterity?.modifier ?? 0;

  // 10 + 敏捷（基础）
  let base = 10 + dex;
  let armorBonus = 0;
  let dexCap: number | null = null;

  // wornArmorId：必须在战斗背包存在。AC 基础值读装备模板 acBase（字符串，如 "16"/"+2"），
  // 与 characterStore.recalculateArmorClass 保持同源——旧代码读 acValue（字段从未存在）导致穿甲 AC 恒 10+敏。
  // 旧背包实例 acBase 为空串（补值前从模板加入），按实例 id（=模板 id）回查装备库模板兜底
  if (character.wornArmorId) {
    const armor = inventory.find(e => (e.childId || e.id) === character.wornArmorId);
    if (armor) {
      const subtype = armor.subtype || '';
      const templateAcBase = (armor as any).acBase || equipmentStore.getById(armor.id)?.acBase || '';
      const parsed = typeof templateAcBase === 'string' ? Number(templateAcBase) : typeof templateAcBase === 'number' ? templateAcBase : NaN;
      if (!isNaN(parsed) && parsed > 0) {
        const baseAc = parsed;
        if (subtype.includes('重型') || subtype.includes('重甲')) {
          armorBonus = baseAc - 10; // 重甲：敏捷不加
          dexCap = 0;
        } else if (subtype.includes('中型') || subtype.includes('中甲')) {
          armorBonus = baseAc - 10;
          dexCap = 2;
        } else {
          // 轻甲
          armorBonus = baseAc - 10;
          dexCap = null;
        }
      }
    }
  }
  let ac = 10 + armorBonus;
  ac += dexCap === null ? dex : Math.min(dex, dexCap);

  // 手持盾牌（必须在战斗背包；读参战者战斗层手持——进战时从角色卡备战槽初始化）
  const heldIds = [
    combatant.heldLeft?.equipmentId,
    combatant.heldRight?.equipmentId,
  ].filter(Boolean) as string[];
  for (const hid of heldIds) {
    const eq = inventory.find(e => (e.childId || e.id) === hid);
    if (eq?.subtype === '盾牌') {
      ac += 2;
      break;
    }
  }
  // 穿戴服装 + bonus（通常服装不提供 AC，但兼容已有逻辑；字段同盔甲走 acBase）
  if (character.wornOutfitId && !character.wornArmorId) {
    const outfit = inventory.find(e => (e.childId || e.id) === character.wornOutfitId);
    if (outfit) {
      const outfitRaw = (outfit as any).acBase;
      const outfitParsed = typeof outfitRaw === 'string' ? Number(outfitRaw) : typeof outfitRaw === 'number' ? outfitRaw : NaN;
      if (!isNaN(outfitParsed) && outfitParsed > ac) ac = outfitParsed;
    }
  }
  return ac;
}

/**
 * 记录"装备变更"——以函数式方式更新 changes。
 * 写操作统一通过本接口，保持数据结构一致。
 */
export function applyEquipmentChange(
  changes: EquipmentChanges | undefined,
  update: (ch: EquipmentChanges) => void,
): EquipmentChanges {
  const target = changes ? {
    added: [...changes.added],
    removedChildIds: [...changes.removedChildIds],
    quantityDeltas: { ...changes.quantityDeltas },
  } : emptyEquipmentChanges();
  update(target);
  return target;
}

/** 手持槽兜底：state 非法值归 ready，equipmentId 仅接受 string | null */
function normalizeHandSlot(v: unknown): HandSlot {
  if (!v || typeof v !== 'object') return { state: 'ready', equipmentId: null };
  const s = v as { state?: unknown; equipmentId?: unknown };
  const state: HandState = s.state === 'action' || s.state === 'unavailable' ? s.state : 'ready';
  return { state, equipmentId: typeof s.equipmentId === 'string' ? s.equipmentId : null };
}

function load(): CombatRecord[] {
  if (recordsCache) return recordsCache;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      recordsCache = [];
      return recordsCache;
    }
    const records: unknown[] = JSON.parse(raw);
    const normalized = records.map((r: any) => {
      // 旧数据没有 equipmentChanges → 置 {}；字段结构不兼容则重建每个参战者的三件套
      const equipmentChangesRaw = r.equipmentChanges;
      const equipmentChanges: Record<string, EquipmentChanges> = {};
      if (equipmentChangesRaw && typeof equipmentChangesRaw === 'object') {
        for (const key of Object.keys(equipmentChangesRaw)) {
          const v: any = (equipmentChangesRaw as any)[key];
          if (!v || typeof v !== 'object') continue;
          const added = Array.isArray(v.added)
            ? v.added.filter((a: any) => a && typeof a === 'object' && typeof a.childId === 'string')
            : [];
          equipmentChanges[key] = {
            added,
            removedChildIds: Array.isArray(v.removedChildIds)
              ? v.removedChildIds.filter((x: any) => typeof x === 'string')
              : [],
            quantityDeltas: (() => {
            const src = v.quantityDeltas;
            const out: Record<string, number> = {};
            if (src && typeof src === 'object') {
              for (const [k, vv] of Object.entries(src as Record<string, unknown>)) {
                if (typeof vv === 'number' && Number.isFinite(vv)) out[k] = vv;
              }
            }
            return out;
          })(),
          };
        }
      }
      const combatants = (r.combatants ?? []).map((c: any) => {
        let actions = c.actions ?? 1;
        if (typeof actions !== 'number' || actions < 0 || !Number.isFinite(actions)) actions = 1;
        let speed = c.speed;
        if ((speed === undefined || speed === null) && c.characterId) {
          try {
            const char = characterStore.get(c.characterId);
            if (char?.speed) speed = char.speed;
          } catch {
            // 角色库加载失败，不要连累战斗记录加载
          }
        }
        return {
          id: c.id ?? crypto.randomUUID(),
          name: c.name ?? '未命名',
          initiative: Number(c.initiative) || 0,
          ac: Number(c.ac) || 0,
          maxHp: Number(c.maxHp) || 0,
          currentHp: Number(c.currentHp) || 0,
          tempHp: typeof c.tempHp === 'number' && Number.isFinite(c.tempHp) ? c.tempHp : undefined,
          isDead: !!c.isDead,
          isUnconscious: !!c.isUnconscious,
          isIncapacitated: !!c.isIncapacitated,
          deathSaveFailures: typeof c.deathSaveFailures === 'number' && Number.isFinite(c.deathSaveFailures) ? Math.max(0, Math.trunc(c.deathSaveFailures)) : 0,
          deathSaveSuccesses: typeof c.deathSaveSuccesses === 'number' && Number.isFinite(c.deathSaveSuccesses) ? Math.max(0, Math.trunc(c.deathSaveSuccesses)) : 0,
          isPc: !!c.isPc,
          characterId: c.characterId ?? undefined,
          note: typeof c.note === 'string' ? c.note : '',
          speed,
          childId: c.childId ?? undefined,
          templateId: c.templateId ?? undefined,
          damageAffinities: c.damageAffinities && typeof c.damageAffinities === 'object' ? c.damageAffinities : undefined,
          attacks: Array.isArray(c.attacks) ? c.attacks : undefined,
          actions,
          movementUsed: typeof c.movementUsed === 'number' && Number.isFinite(c.movementUsed) ? Math.max(0, Math.trunc(c.movementUsed)) : 0,
          speedModifier: typeof c.speedModifier === 'number' && Number.isFinite(c.speedModifier) ? Math.trunc(c.speedModifier) : 0,
          dashExtraMovement: typeof c.dashExtraMovement === 'number' && Number.isFinite(c.dashExtraMovement) ? Math.max(0, Math.trunc(c.dashExtraMovement)) : 0,
          // 属性值兜底（老数据兼容）
          strength: typeof c.strength === 'number' && Number.isFinite(c.strength) ? Math.max(1, Math.min(30, Math.trunc(c.strength))) : undefined,
          dexterity: typeof c.dexterity === 'number' && Number.isFinite(c.dexterity) ? Math.max(1, Math.min(30, Math.trunc(c.dexterity))) : undefined,
          constitution: typeof c.constitution === 'number' && Number.isFinite(c.constitution) ? Math.max(1, Math.min(30, Math.trunc(c.constitution))) : undefined,
          intelligence: typeof c.intelligence === 'number' && Number.isFinite(c.intelligence) ? Math.max(1, Math.min(30, Math.trunc(c.intelligence))) : undefined,
          wisdom: typeof c.wisdom === 'number' && Number.isFinite(c.wisdom) ? Math.max(1, Math.min(30, Math.trunc(c.wisdom))) : undefined,
          charisma: typeof c.charisma === 'number' && Number.isFinite(c.charisma) ? Math.max(1, Math.min(30, Math.trunc(c.charisma))) : undefined,
          pendingAdvantageSources: Array.isArray(c.pendingAdvantageSources) ? c.pendingAdvantageSources.filter(
            (s: any) => s && typeof s === 'object' && typeof s.id === 'string'
          ).map((s: any) => ({
            id: s.id,
            fromId: typeof s.fromId === 'string' ? s.fromId : undefined,
            fromName: typeof s.fromName === 'string' ? s.fromName : undefined,
            scene: s.scene ?? 'any',
            mode: s.mode === 'disadvantage' ? 'disadvantage' : 'advantage',
            reason: typeof s.reason === 'string' ? s.reason : '未命名效果',
            kind: s.kind ?? 'pending',
            targetId: typeof s.targetId === 'string' ? s.targetId : undefined,
            requireTargetNearFromId: !!s.requireTargetNearFromId,
            expireOnCombatantId: typeof s.expireOnCombatantId === 'string' ? s.expireOnCombatantId : undefined,
          consumed: !!s.consumed,
          createdRound: typeof s.createdRound === 'number' && Number.isFinite(s.createdRound) ? s.createdRound : 0,
          expireRound: typeof s.expireRound === 'number' && Number.isFinite(s.expireRound) ? s.expireRound : -1,
          })) : [],
          // 次数型检定奖惩（吟游诗人激励骰等；白名单重建，缺兜底会在刷新后丢骰且下次保存永久抹掉）
          pendingCheckModifiers: Array.isArray(c.pendingCheckModifiers) ? c.pendingCheckModifiers.filter(
            (m: any) => m && typeof m === 'object' && typeof m.id === 'string'
          ).map((m: any) => ({
            id: m.id,
            fromId: typeof m.fromId === 'string' ? m.fromId : undefined,
            fromName: typeof m.fromName === 'string' ? m.fromName : undefined,
            reason: typeof m.reason === 'string' ? m.reason : '未命名奖惩',
            mode: m.mode === 'penalty' ? 'penalty' : 'bonus',
            dice: m.dice && typeof m.dice === 'object' ? {
              count: typeof m.dice.count === 'number' && Number.isFinite(m.dice.count) ? Math.max(0, Math.trunc(m.dice.count)) : 0,
              sides: typeof m.dice.sides === 'number' && Number.isFinite(m.dice.sides) ? Math.max(0, Math.trunc(m.dice.sides)) : 0,
              flatBonus: typeof m.dice.flatBonus === 'number' && Number.isFinite(m.dice.flatBonus) ? m.dice.flatBonus : 0,
            } : { count: 0, sides: 0, flatBonus: 0 },
            scene: m.scene ?? 'any',
            forced: !!m.forced,
            remainingUses: typeof m.remainingUses === 'number' && Number.isFinite(m.remainingUses) ? Math.max(0, Math.trunc(m.remainingUses)) : 1,
            totalUses: typeof m.totalUses === 'number' && Number.isFinite(m.totalUses) ? Math.max(1, Math.trunc(m.totalUses)) : 1,
            consumed: !!m.consumed,
            createdRound: typeof m.createdRound === 'number' && Number.isFinite(m.createdRound) ? Math.trunc(m.createdRound) : 0,
            expireRound: typeof m.expireRound === 'number' && Number.isFinite(m.expireRound) ? m.expireRound : -1,
          })) : [],
          // 专注状态（战斗临时数据，随记录持久化；非法结构静默丢弃）
          concentration: (() => {
            const cc = c.concentration;
            if (!cc || typeof cc !== 'object' || typeof cc.spellName !== 'string' || !cc.spellName) return undefined;
            return {
              spellName: cc.spellName,
              startedRound: typeof cc.startedRound === 'number' && Number.isFinite(cc.startedRound) ? Math.trunc(cc.startedRound) : 0,
            };
          })(),
          // 语音可用状态（失能 toggle 写入；缺省 undefined = 未手动置灰）
          canSpeak: typeof c.canSpeak === 'boolean' ? c.canSpeak : undefined,
          // 战斗层手持（进战从备战槽初始化；缺兜底会在刷新后丢手持且下次保存永久抹掉）
          heldLeft: normalizeHandSlot(c.heldLeft),
          heldRight: normalizeHandSlot(c.heldRight),
        };
      });
      return {
        id: r.id,
        title: r.title ?? '未命名战斗',
        combatants,
        rounds: r.rounds ?? [],
        mode: r.mode,
        isProvingGround: r.isProvingGround ?? false,
        settledAt: typeof r.settledAt === 'number' && Number.isFinite(r.settledAt) ? r.settledAt : undefined,
        turnTodos: (r.turnTodos || []).map((t: any) => ({
          id: t.id ?? crypto.randomUUID(),
          combatantId: t.combatantId ?? '',
          name: t.name ?? '',
          type: t.type ?? null,
          startRound: typeof t.startRound === 'number' && Number.isFinite(t.startRound) ? t.startRound : 0,
          endRound: typeof t.endRound === 'number' && Number.isFinite(t.endRound) ? t.endRound : -1,
          executed: !!t.executed,
        })),
        equipmentChanges,
        // 法术位消耗漏斗（白名单重建：数字正值兜底，防止旧数据结构异常污染）
        spellSlotChanges: (() => {
          const src = r.spellSlotChanges;
          const out: Record<string, Record<string, number>> = {};
          if (src && typeof src === 'object') {
            for (const [cid, levels] of Object.entries(src as Record<string, unknown>)) {
              if (!levels || typeof levels !== 'object') continue;
              const lv: Record<string, number> = {};
              for (const [lk, n] of Object.entries(levels as Record<string, unknown>)) {
                if (typeof n === 'number' && Number.isFinite(n) && n > 0) lv[lk] = n;
              }
              out[cid] = lv;
            }
          }
          return out;
        })(),
        loadedWeapons: r.loadedWeapons && typeof r.loadedWeapons === 'object' ? { ...r.loadedWeapons } : undefined,
        loadingAttackedThisRound: r.loadingAttackedThisRound && typeof r.loadingAttackedThisRound === 'object' ? { ...r.loadingAttackedThisRound } : undefined,
        playbackState: r.playbackState && typeof r.playbackState === 'object' ? {
          started: !!r.playbackState.started,
          paused: !!r.playbackState.paused,
          currentTurn: r.playbackState.currentTurn && typeof r.playbackState.currentTurn === 'object' && typeof r.playbackState.currentTurn.round === 'number' && typeof r.playbackState.currentTurn.combatantId === 'string'
            ? { round: r.playbackState.currentTurn.round, combatantId: r.playbackState.currentTurn.combatantId }
            : null,
        } : undefined,
        castLogs: Array.isArray(r.castLogs) ? r.castLogs.filter(
          (l: any) => l && typeof l === 'object' && typeof l.id === 'string' && typeof l.castId === 'string'
        ) : [],
        // 各参战者最近施放法术栈（白名单重建：缺兜底会在刷新后丢记忆，下次保存永久抹掉）
        lastSpellCasts: r.lastSpellCasts && typeof r.lastSpellCasts === 'object'
          ? Object.fromEntries(
              Object.entries(r.lastSpellCasts)
                .filter(([, v]) => Array.isArray(v))
                .map(([k, v]) => [k, (v as any[]).filter((s) => typeof s === 'string').slice(0, 10)]),
            )
          : undefined,
        // 模拟模式操作日志（白名单重建：缺此项会在刷新后丢日志，且下次保存把日志永久抹掉）
        operationLog: Array.isArray(r.operationLog) ? r.operationLog.filter(
          (e: any) => e && typeof e === 'object'
            && typeof e.id === 'string'
            && typeof e.timestamp === 'number' && Number.isFinite(e.timestamp)
            && typeof e.text === 'string'
            && typeof e.kind === 'string',
        ).map((e: any) => ({
          id: e.id,
          timestamp: e.timestamp,
          combatantId: typeof e.combatantId === 'string' ? e.combatantId : undefined,
          kind: e.kind,
          text: e.text,
        })) : [],
        createdAt: Number(r.createdAt) || Date.now(),
        updatedAt: Number(r.updatedAt) || Date.now(),
      };
    });
    recordsCache = normalized;
    return normalized;
  } catch (e) {
    console.error('战斗记录加载失败，返回空列表：', e);
    recordsCache = [];
    return recordsCache;
  }
}

function save(records: CombatRecord[]): void {
  const prev = recordsCache;
  recordsCache = records;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(records));
    notify();
  } catch (e) {
    console.error('战斗记录保存失败:', e);
  }
  // 云端异步备份（fire-and-forget）：diff 增改删，防抖批量上传
  syncListDiff('combat', prev, records, r => r.id);
}

/** 云端拉取当前团组战斗记录并按 updatedAt 合并本地（惰性首拉一次，失败静默保持本地） */
async function syncFromBackend(): Promise<void> {
  await pullArtifactsOnce<CombatRecord[]>('combat', list => {
    // 合并而非替换：本地刚写入尚未上云的记录（updatedAt 较新）不被云端旧快照回退
    const merged = mergeByIdentity(load(), list, r => r.id, r => r.updatedAt);
    recordsCache = null;
    try {
      localStorage.setItem(storageKey(), JSON.stringify(merged));
    } catch {
      return;
    }
    load();
    notify();
  });
}

// =======================
// 对外 API（严格对齐设计文档）
// =======================
const combatStore = {
  /**
   * 获取所有战斗记录（按更新时间倒序）
   */
  getAll(): CombatRecord[] {
    // 惰性首拉云端（进程内仅一次，失败/未登录静默）
    void syncFromBackend();
    return [...load()].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /**
   * 根据ID获取单个战斗记录
   */
  get(id: string): CombatRecord | null {
    const found = load().find(r => r.id === id) ?? null;
    if (!found) return null;
    // 浅拷贝：防止调用方 mutate 污染内存缓存（原实现每次 parse 天然隔离）
    return { ...found, combatants: [...found.combatants], rounds: [...found.rounds], turnTodos: found.turnTodos ? [...found.turnTodos] : undefined, castLogs: found.castLogs ? [...found.castLogs] : undefined, lastSpellCasts: found.lastSpellCasts ? { ...found.lastSpellCasts } : undefined };
  },

  /**
   * 创建新战斗记录
   * @param title 战斗名称
   * @param combatants 参战者列表
   */
  create(title: string, combatants: Omit<Combatant, 'id'>[]): CombatRecord {
    const now = Date.now();
    const record: CombatRecord = {
      id: crypto.randomUUID(),
      title: title.trim() || '未命名战斗',
      combatants: combatants.map(c => ({
        ...c,
        id: crypto.randomUUID(),
        isDead: false,
        isPc: c.isPc ?? false,
        actions: typeof c.actions === 'number' && c.actions >= 0 ? c.actions : 1,
      })),
      rounds: [],
      createdAt: now,
      updatedAt: now,
    };
    const records = load();
    records.push(record);
    save(records);
    return record;
  },

  /**
   * 更新战斗记录
   * @param id 战斗记录ID
   * @param partial 待更新的字段
   */
  update(id: string, partial: Partial<Omit<CombatRecord, 'id' | 'createdAt'>>): void {
    const records = load();
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return;

    records[index] = {
      ...records[index],
      ...partial,
      updatedAt: Date.now(),
    };
    save(records);
  },

  /**
   * 删除战斗记录
   */
  delete(id: string): void {
    const records = load().filter(r => r.id !== id);
    save(records);
  },

  /**
   * 清空所有战斗记录
   */
  clear(): void {
    save([]);
  },

  /**
   * 导出为JSON文件
   */
  exportToFile(): void {
    const records = load();
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnd-combat-records-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * 从JSON文件导入
   */
  importFromFile(file: File): Promise<CombatRecord[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const records: CombatRecord[] = JSON.parse(e.target?.result as string);
          if (!Array.isArray(records)) throw new Error('导入文件格式错误');
          save(records);
          resolve(records);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  },

  /**
   * 追加施法步骤日志（收尾步骤一次性批量写入；记录不存在时静默跳过，兜底不阻塞结算）
   */
  appendCastLogs(recordId: string, logs: CastStepLog[]): void {
    if (!Array.isArray(logs) || logs.length === 0) return;
    const record = this.get(recordId);
    if (!record) return;
    this.update(recordId, { castLogs: [...(record.castLogs ?? []), ...logs] });
  },

  /**
   * 记录参战者一次施法（收尾确认时调用）：spellId 置于该参战者最近栈顶，
   * 去重后截断保留最近 10 个。施法列表排序据此把上次施放的排前。
   */
  recordSpellCast(recordId: string, combatantId: string, spellId: string): void {
    if (!recordId || !combatantId || !spellId) return;
    const record = this.get(recordId);
    if (!record) return;
    const prev = record.lastSpellCasts?.[combatantId] ?? [];
    const next = [spellId, ...prev.filter((id) => id !== spellId)].slice(0, 10);
    this.update(recordId, { lastSpellCasts: { ...(record.lastSpellCasts ?? {}), [combatantId]: next } });
  },

  /**
   * 订阅数据变更
   */
  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },

  /**
   * 消耗 1 个可用动作。
   * - 模拟模式：动作无限，扣减后若归 0 立即重置为 1（永远可动作）
   * - 放映模式：扣减后可为 0（降为 0 不再允许发起动作，直到下回合开始恢复）
   * @returns 扣减后的可用动作数；找不到参战者时返回 null
   */
  consumeAction(recordId: string, combatantId: string, mode: 'simulation' | 'playback'): number | null {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return null;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return null;
    const cur = typeof record.combatants[idx].actions === 'number' && (record.combatants[idx].actions as number) >= 0
      ? (record.combatants[idx].actions as number)
      : 1;
    let next = Math.max(0, cur - 1);
    if (mode === 'simulation' && next === 0) next = 1;
    record.combatants[idx] = { ...record.combatants[idx], actions: next };
    record.updatedAt = Date.now();
    save(records);
    return next;
  },

  /**
   * 消耗某参战者的可用附赠动作数。
   * 放映模式：扣 1，到 0 为止；模拟模式：无限（扣到 0 立即回 1）。
   * @returns 消耗后的剩余附赠动作数；找不到参战者时返回 null
   */
  consumeBonusAction(recordId: string, combatantId: string, mode: 'simulation' | 'playback'): number | null {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return null;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return null;
    const cur = typeof record.combatants[idx].bonusActions === 'number' && (record.combatants[idx].bonusActions as number) >= 0
      ? (record.combatants[idx].bonusActions as number)
      : 1;
    let next = Math.max(0, cur - 1);
    if (mode === 'simulation' && next === 0) next = 1;
    record.combatants[idx] = { ...record.combatants[idx], bonusActions: next };
    record.updatedAt = Date.now();
    save(records);
    return next;
  },

  /**
   * 重置某参战者的可用动作数为 1（放映模式每回合开始时调用）。
   * 同时将 movementUsed 归零（D&D 5e：每回合开始恢复完整移动力）。
   * 附赠动作也恢复为 1（D&D 5e：每回合开始恢复附赠动作）。
   * @returns 重置后的可用动作数（恒为 1）；找不到参战者时返回 null
   */
  resetActions(recordId: string, combatantId: string): number | null {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return null;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return null;
    record.combatants[idx] = { ...record.combatants[idx], actions: 1, bonusActions: 1, movementUsed: 0, speedModifier: 0, dashExtraMovement: 0, canSpeak: true };
    record.updatedAt = Date.now();
    save(records);
    return 1;
  },

  /**
   * 消耗某参战者的移动力（feet 尺），按 D&D 5e 每回合总 speed 上限。
   * 放映暂停 / 模拟模式下不会真扣（直接返回传入的 distanceFeet，表示允许移动）。
   * @returns 实际消耗的移动力（≤ distanceFeet），0 表示移动力不足，调用方应阻止此次移动
   */
  consumeMovement(recordId: string, combatantId: string, distanceFeet: number, mode: 'simulation' | 'playback', playbackActive: boolean): number {
    if (distanceFeet <= 0) return 0;
    // 模拟模式 / 放映暂停：不扣减，返回全部距离
    if (mode !== 'playback' || !playbackActive) return distanceFeet;
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return distanceFeet;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return distanceFeet;
    const combatant = record.combatants[idx];
    const battleSpeed = (combatant.speed ?? 0) + (combatant.speedModifier ?? 0);
    const dashExtra = combatant.dashExtraMovement ?? 0;
    const totalAvailable = battleSpeed + dashExtra;
    if (totalAvailable <= 0) return distanceFeet;
    const used = combatant.movementUsed ?? 0;
    const remaining = Math.max(0, totalAvailable - used);
    const allowed = Math.min(remaining, distanceFeet);
    if (allowed <= 0) return 0;
    record.combatants[idx] = { ...combatant, movementUsed: used + allowed };
    record.updatedAt = Date.now();
    save(records);
    return allowed;
  },

  /**
   * 恢复某参战者的移动力（撤回移动时调用）。与 consumeMovement 对称：
   * 仅放映模式且放映中才真正回退 movementUsed，其他模式 no-op。
   */
  refundMovement(recordId: string, combatantId: string, feet: number, mode: 'simulation' | 'playback', playbackActive: boolean): void {
    if (feet <= 0) return;
    if (mode !== 'playback' || !playbackActive) return;
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const used = combatant.movementUsed ?? 0;
    record.combatants[idx] = { ...combatant, movementUsed: Math.max(0, used - feet) };
    record.updatedAt = Date.now();
    save(records);
  },

  /**
   * 获取某参战者的剩余移动力（尺）。
   * 模拟模式 / 放映暂停 / 未设置 speed 时，返回可用移动力 (speed + speedModifier + dashExtraMovement)；
   * 否则返回 Math.max(0, battleSpeed + dashExtraMovement - movementUsed)。
   */
  getRemainingMovement(combatant: Combatant, mode?: 'simulation' | 'playback', playbackActive?: boolean): number {
    const availableMovement = (combatant.speed ?? 0) + (combatant.speedModifier ?? 0) + (combatant.dashExtraMovement ?? 0);
    if (!mode || mode === 'simulation' || !playbackActive) return availableMovement;
    return Math.max(0, availableMovement - (combatant.movementUsed ?? 0));
  },

  // =======================
  // 法术位消耗漏斗（战斗临时副本：角色卡源不被触碰，展示/判定读「源 + delta」叠加）
  // =======================

  /** 读某参战者本场战斗已消耗的法术位 delta（levelKey → 消耗数；无记录返回 {}） */
  getSpellSlotDeltas(recordId: string, combatantId: string): Partial<Record<SpellSlotLevel, number>> {
    const record = load().find(r => r.id === recordId);
    return { ...(record?.spellSlotChanges?.[combatantId] ?? {}) };
  },

  /** 消耗一个指定环位：delta+1。内部按「角色卡 used + delta < max」校验上限，超限 no-op 返回 false */
  consumeSpellSlot(recordId: string, combatantId: string, levelKey: SpellSlotLevel): boolean {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return false;
    const combatant = record.combatants.find(c => c.id === combatantId);
    const char = combatant?.characterId ? characterStore.get(combatant.characterId) : null;
    const slot = char?.spells?.spellSlots?.[levelKey];
    if (!slot || slot.max <= 0) return false;
    const delta = record.spellSlotChanges?.[combatantId]?.[levelKey] ?? 0;
    if (slot.used + delta >= slot.max) return false;
    if (!record.spellSlotChanges) record.spellSlotChanges = {};
    const levels = { ...(record.spellSlotChanges[combatantId] ?? {}) };
    levels[levelKey] = delta + 1;
    record.spellSlotChanges = { ...record.spellSlotChanges, [combatantId]: levels };
    record.updatedAt = Date.now();
    save(records);
    return true;
  },

  /** 恢复一个指定环位：delta-1（下限 0）。无已消耗记录时 no-op 返回 false */
  restoreSpellSlot(recordId: string, combatantId: string, levelKey: SpellSlotLevel): boolean {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return false;
    const delta = record.spellSlotChanges?.[combatantId]?.[levelKey] ?? 0;
    if (delta <= 0) return false;
    const levels = { ...(record.spellSlotChanges?.[combatantId] ?? {}) };
    if (delta - 1 <= 0) delete levels[levelKey];
    else levels[levelKey] = delta - 1;
    record.spellSlotChanges = { ...(record.spellSlotChanges ?? {}), [combatantId]: levels };
    record.updatedAt = Date.now();
    save(records);
    return true;
  },

  /**
   * NPC 施法可用次数：按环阶组消耗一次（ring → 已用+1）。
   * 状态挂 combatant.spellcastingUsage（随 combatants 快照回溯还原）；
   * 上限由调用方按组 usage.kind/count 校验，atWill/无注记组不调用。
   * 不可变替换（新对象赋值），避免污染浅拷贝回溯快照里的引用
   */
  consumeNpcSpellcasting(recordId: string, combatantId: string, ring: string): boolean {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return false;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx < 0) return false;
    const combatant = record.combatants[idx];
    const used = { ...(combatant.spellcastingUsage ?? {}) };
    used[ring] = (used[ring] ?? 0) + 1;
    const next = { ...combatant, spellcastingUsage: used };
    record.combatants = record.combatants.map((c, i) => (i === idx ? next : c));
    record.updatedAt = Date.now();
    save(records);
    return true;
  },

  /**
   * 战斗中的法术位视图：角色卡显示数据（双源 max 合并）+ 本场消耗 delta 叠加。
   * 返回结构与 getSpellSlotDisplayData 的 spellSlots 一致（available 已扣除战斗消耗），供战斗侧 UI 直接渲染。
   */
  getCombatSpellSlotView(recordId: string, combatantId: string) {
    const record = load().find(r => r.id === recordId);
    const combatant = record?.combatants.find(c => c.id === combatantId);
    const char = combatant?.characterId ? characterStore.get(combatant.characterId) : null;
    if (!char) return null;
    const display = characterStore.getSpellSlotDisplayData(char);
    if (!display || display.spellSlots.length === 0) return null;
    const deltas = record?.spellSlotChanges?.[combatantId] ?? {};
    return display.spellSlots.map(slot => {
      const delta = deltas[`level${slot.level}` as SpellSlotLevel] ?? 0;
      const available = Math.max(0, slot.available - delta);
      return { ...slot, available, used: slot.max - available };
    });
  },

  // =======================
  // 战斗结算（Settlement）：变更并入角色卡 + 记录封存
  // =======================

  buildSettlementPreview(recordId: string): SettlementPreview | null {
    // 法术位环级显示名（与 characterStore 内部常量同源，本地复制避免扩散内部 API）
    const SPELL_LEVEL_LABELS: Record<number, string> = {
      1: '1环', 2: '2环', 3: '3环', 4: '4环', 5: '5环',
      6: '6环', 7: '7环', 8: '8环', 9: '9环',
    };
    const record = load().find(r => r.id === recordId);
    if (!record || record.isProvingGround) return null;
    const entries: SettlementEntry[] = [];

    for (const c of record.combatants) {
      if (!c.isPc || !c.characterId) continue;
      const char = characterStore.get(c.characterId);
      const entry: SettlementEntry = {
        combatantId: c.id,
        characterId: c.characterId,
        characterName: c.name,
        characterMissing: !char,
        equipment: [],
        spellSlots: [],
        hp: null,
        statuses: [],
      };
      entries.push(entry);
      if (!char) continue;

      // 装备净变化（与变更信息弹窗同语义：delta = combatQty - srcQty，removed 优先抵消）
      const changes = record.equipmentChanges?.[c.id];
      const qtyMap = computeChildQtyMap(char, changes);
      for (const [cid, info] of qtyMap) {
        if (info.combatQty === info.srcQty) continue;
        entry.equipment.push({
          childId: cid,
          name: info.srcEq?.name || info.addedEq?.name || '未命名物品',
          srcQty: info.srcQty,
          resultQty: info.combatQty,
          removed: info.combatQty === 0 && !!changes?.removedChildIds.includes(cid),
          added: info.srcQty === 0 && info.combatQty > 0 && !!info.addedEq,
        });
      }

      // 法术位消耗（delta > 0 才列出）
      const slotDeltas = record.spellSlotChanges?.[c.id] ?? {};
      for (const [levelKey, delta] of Object.entries(slotDeltas)) {
        if (!delta || delta <= 0) continue;
        const slot = char.spells?.spellSlots?.[levelKey as SpellSlotLevel];
        const lvNum = parseInt(levelKey.replace('level', ''), 10) || 0;
        entry.spellSlots.push({
          levelKey,
          label: SPELL_LEVEL_LABELS[lvNum] || levelKey,
          delta,
          used: slot?.used ?? 0,
          max: slot?.max ?? 0,
        });
      }

      // HP（角色卡当前 → 参战者当前 clamp，相等则无变更）
      const targetHp = Math.max(0, Math.min(char.maxHp || 0, c.currentHp || 0));
      if ((char.currentHp || 0) !== targetHp) {
        entry.hp = { from: char.currentHp || 0, to: targetHp };
      }

      // 状态继承（内存活跃实例 + 排除判定）
      const activeInstances = globalStatusManager.getActiveStatuses(c.id);
      for (const inst of activeInstances) {
        const excludeReason = this.evaluateStatusInheritable(inst, record, c);
        entry.statuses.push({ instance: { ...inst }, inheritable: !excludeReason, excludeReason });
      }
      // 昏迷补全：参战者昏迷但无活跃 unconscious 实例 → 列出待生成项（instanceId 带 pending 前缀）
      if (c.isUnconscious && !activeInstances.some(i => i.definitionId === 'unconscious')) {
        entry.statuses.push({
          instance: {
            instanceId: `pending-unconscious-${c.id}`,
            definitionId: 'unconscious',
            targetId: c.id,
            scope: 'combat',
            isActive: true,
            declaredAt: Date.now(),
          },
          inheritable: true,
        });
      }
    }

    return { recordId, entries };
  },

  /**
   * 状态可继承性判定（纯函数）：返回排除原因，null = 可继承。
   * 规则：参战者死亡终结一切；专注维持型依赖施法者存活且专注未断；定义丢失排除。
   */
  evaluateStatusInheritable(
    inst: StatusInstance,
    record: CombatRecord,
    target: Combatant,
  ): string | null {
    if (target.isDead) return '参战者已死亡';
    const definition = statusLibrary.get(inst.definitionId);
    if (!definition) return '状态定义丢失';
    // 专注维持：实例挂在某参战者专注声明下（concentration.statusIds）。
    // 专注已断的实例已被 declareEnd 移出活跃列表，此处防御：声明缺失/施法者死亡失能 → 排除
    const holder = record.combatants.find(cb => cb.concentration?.statusIds?.includes(inst.instanceId));
    if (definition.duration.type === 'concentration' || holder) {
      if (!holder) return '专注来源缺失';
      if (holder.isDead) return '施法者已死亡';
      if (holder.isIncapacitated) return '施法者已失能，专注中断';
    }
    return null;
  },

  /** 应用结算（唯一写入口）：仅应用勾选项；已封存/试验场 guard */
  settleCombat(recordId: string, selections: SettlementSelections): boolean {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record || record.isProvingGround || record.settledAt) return false;
    const now = Date.now();

    for (const entry of record.combatants) {
      if (!entry.isPc || !entry.characterId) continue;
      const char = characterStore.get(entry.characterId);
      if (!char) continue;
      let charDirty = false;
      const charUpdate: Partial<Character> = {};

      // 1. 装备并入：勾选 childId 按 computeChildQtyMap 结果写回
      const selectedEq = selections.equipmentChildIds[entry.id] || [];
      if (selectedEq.length > 0) {
        const changes = record.equipmentChanges?.[entry.id];
        const qtyMap = computeChildQtyMap(char, changes);
        // char.equipment 元素/数组与 store 缓存共享引用：全部改动在副本上做，最后统一写回
        const workingEquipment = [...char.equipment];
        const removedSet = new Set<string>();
        for (const cid of selectedEq) {
          const info = qtyMap.get(cid);
          if (!info || info.combatQty === info.srcQty) continue;
          if (info.combatQty === 0) {
            // 整件移除（含 added 后又被移除的净零情况：srcQty=0 也走移除，跳过追加）
            removedSet.add(cid);
          } else if (info.srcQty > 0) {
            // 更新源条目数量
            const eqIdx = workingEquipment.findIndex(e => (e.childId || e.id) === cid);
            if (eqIdx >= 0) workingEquipment[eqIdx] = { ...workingEquipment[eqIdx], quantity: info.combatQty };
          } else if (info.addedEq) {
            // 战斗新增：追加条目（childId 保留战斗实例值，唯一即可）
            workingEquipment.push({ ...info.addedEq, childId: cid });
          }
        }
        charUpdate.equipment = removedSet.size > 0
          ? workingEquipment.filter(e => !removedSet.has(e.childId || e.id))
          : workingEquipment;
        charDirty = true;
      }

      // 2. 法术位并入：delta 累加 used，clamp [0, max]
      if (selections.spellSlotCombatantIds.includes(entry.id)) {
        const slotDeltas = record.spellSlotChanges?.[entry.id] ?? {};
        for (const [levelKey, delta] of Object.entries(slotDeltas)) {
          if (!delta || delta <= 0) continue;
          const slot = char.spells?.spellSlots?.[levelKey as SpellSlotLevel];
          if (!slot) continue;
          const clamped = Math.max(0, Math.min(slot.max, slot.used + delta));
          characterStore.updateSpellSlots(char.id, levelKey as SpellSlotLevel, { used: clamped });
        }
      }

      // 3. HP 并入：参战者当前 HP clamp [0, maxHp] 写回（临时 HP 丢弃）
      if (selections.hpCombatantIds.includes(entry.id)) {
        charUpdate.currentHp = Math.max(0, Math.min(char.maxHp || 0, entry.currentHp || 0));
        charDirty = true;
      }

      // 4. 状态继承：活跃实例转 global 域写回角色卡；战斗中已结束的挂载实例从角色卡移除
      const selectedStatuses = selections.statusInstanceIds[entry.id] || [];
      const charStatuses = Array.isArray(char.statuses) ? [...char.statuses] : [];
      const activeInMemory = globalStatusManager.getActiveStatuses(entry.id);
      let statusesTouched = false;

      // 4a. 勾选继承：转域写回（同 instanceId 替换 / 新实例追加）
      for (const inst of activeInMemory) {
        if (!selectedStatuses.includes(inst.instanceId)) continue;
        const excludeReason = this.evaluateStatusInheritable(inst, record, entry);
        if (excludeReason) continue;
        const wasRoundDriven = inst.expirePolicy === 'rounds' || inst.expirePolicy === 'combatantTurn';
        const globalInst: StatusInstance = {
          ...inst,
          scope: 'global',
          targetId: char.id,
          combatId: undefined,
          // 回合驱动型在战斗外无回合计数 → 转手动取消，剩余提示存 metadata
          expirePolicy: wasRoundDriven ? 'manual' : inst.expirePolicy,
          durationRounds: undefined,
          startRound: undefined,
          expiresAtRound: undefined,
          anchorCombatantId: undefined,
          turnCount: undefined,
          metadata: wasRoundDriven
            ? { ...(inst.metadata ?? {}), remainRounds: inst.durationRounds }
            : { ...(inst.metadata ?? {}) },
        };
        const idx = charStatuses.findIndex(s => s.instanceId === inst.instanceId);
        if (idx >= 0) charStatuses[idx] = globalInst;
        else charStatuses.push(globalInst);
        statusesTouched = true;
        // 内存 combat 实例终结（写回完成，避免残留）
        globalStatusManager.declareEnd(inst.instanceId);
      }

      // 4b. 已结束挂载实例清理：本战斗挂载的实例若战斗中已 declareEnd，同步从角色卡移除
      for (const s of [...charStatuses]) {
        const mem = globalStatusManager.getInstanceById(s.instanceId);
        if (mem && mem.scope === 'combat' && mem.combatId === recordId && !mem.isActive) {
          const idx = charStatuses.findIndex(x => x.instanceId === s.instanceId);
          if (idx >= 0) {
            charStatuses.splice(idx, 1);
            statusesTouched = true;
          }
        }
      }

      // 4c. 昏迷补全：参战者昏迷、勾选了状态继承、且无活跃 unconscious 实例 → 生成持久实例
      const hasActiveUnconscious = charStatuses.some(
        s => s.definitionId === 'unconscious' && s.isActive && (!s.expiresAt || s.expiresAt > now),
      ) || globalStatusManager.getActiveStatuses(entry.id).some(i => i.definitionId === 'unconscious');
      if (entry.isUnconscious && selectedStatuses.length > 0 && !hasActiveUnconscious) {
        charStatuses.push({
          instanceId: `unconscious-${entry.id}-${now}`,
          definitionId: 'unconscious',
          targetId: char.id,
          scope: 'global',
          isActive: true,
          declaredAt: now,
          expirePolicy: 'manual',
        });
        statusesTouched = true;
      }

      if (statusesTouched) {
        charUpdate.statuses = charStatuses;
        charDirty = true;
      }

      if (charDirty) characterStore.update(char.id, charUpdate);
    }

    combatStore.update(recordId, { settledAt: now, updatedAt: now });
    return true;
  },

  /**
   * 下次开战挂载：把角色卡上仍活跃且未过期的持久状态复制进内存 combat 域。
   * instanceId 保留原值 → 结算写回时按同 ID 替换角色卡条目（单例流转）。
   */
  mountCharacterStatuses(recordId: string, combatantId: string): void {
    const record = load().find(r => r.id === recordId);
    if (!record || record.isProvingGround) return;
    const combatant = record.combatants.find(c => c.id === combatantId);
    const char = combatant?.characterId ? characterStore.get(combatant.characterId) : null;
    if (!char || !Array.isArray(char.statuses)) return;
    const now = Date.now();
    for (const inst of char.statuses) {
      if (!inst.isActive) continue;
      if (inst.expiresAt && now >= inst.expiresAt) continue;
      if (inst.scope === 'combat' && inst.combatId && inst.combatId !== recordId) continue;
      globalStatusManager.restoreInstance({
        ...inst,
        targetId: combatantId,
        scope: 'combat',
        combatId: recordId,
      });
    }
  },

  // =======================
  // 回合待办（TurnTodo）CRUD
  // =======================

  addTurnTodo(recordId: string, todo: Omit<TurnTodo, 'id' | 'executed'>): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    if (!record.turnTodos) record.turnTodos = [];
    const rand6 = Math.random().toString(36).slice(2, 8);
    record.turnTodos = [...record.turnTodos, {
      ...todo,
      id: `${todo.combatantId}-todo-${Date.now()}-${rand6}`,
      executed: false,
    }];
    record.updatedAt = Date.now();
    save(records);
  },

  removeTurnTodo(recordId: string, todoId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record || !record.turnTodos) return;
    record.turnTodos = record.turnTodos.filter(t => t.id !== todoId);
    record.updatedAt = Date.now();
    save(records);
  },

  toggleTurnTodo(recordId: string, todoId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record || !record.turnTodos) return;
    record.turnTodos = record.turnTodos.map(t =>
      t.id === todoId ? { ...t, executed: !t.executed } : t
    );
    record.updatedAt = Date.now();
    save(records);
  },

  /** 模拟模式：追加一条操作日志（放映模式写 rounds，本函数仅在模拟模式被 recordOperation 调用） */
  addOperationLog(
    recordId: string,
    entry: { combatantId?: string; kind: OperationLogEntry['kind']; text: string },
  ): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const newEntry: OperationLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      combatantId: entry.combatantId,
      kind: entry.kind,
      text: entry.text,
    };
    record.operationLog = [...(record.operationLog ?? []), newEntry];
    record.updatedAt = Date.now();
    save(records);
  },

  clearOperationLog(recordId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    record.operationLog = [];
    record.updatedAt = Date.now();
    save(records);
  },

  toggleIncapacitated(sessionId: string, combatantId: string): void {
    const list = load();
    const idx = list.findIndex((b) => b.id === sessionId);
    if (idx === -1) return;
    const combatants = list[idx].combatants.map(c =>
      c.id === combatantId
        ? { ...c, isIncapacitated: !c.isIncapacitated, canSpeak: c.isIncapacitated }
        : c
    );
    list[idx] = { ...list[idx], combatants, updatedAt: Date.now() };
    // 失能瞬间即打断专注（D&D 5e）：失能移除后专注无法恢复，清理在此即时执行
    if (combatants.some(c => c.id === combatantId && c.isIncapacitated && c.concentration)) {
      const broken = combatants.find(c => c.id === combatantId && c.isIncapacitated);
      this.removeConcentrationStatuses(broken?.concentration);
      list[idx].combatants = combatants.map(c =>
        c.id === combatantId ? { ...c, concentration: undefined } : c
      );
    }
    save(list);
  },

  /**
   * 专注中断联动：移除本次专注声明挂载的状态实例（流程附加的抗性等）。
   * 状态实例在 globalStatusManager（纯内存）中按 instanceId 全局定位，
   * 与专注字段同生命周期——专注断则流程附加的效果断（「专注，至多 X」语义闭环）。
   * 幂等：declareEnd 对已结束实例为 no-op。
   */
  removeConcentrationStatuses(concentration?: Combatant['concentration']): void {
    for (const statusId of concentration?.statusIds ?? []) {
      globalStatusManager.declareEnd(statusId);
    }
  },

  resetTurnTodosForRound(recordId: string, round: number): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    if (record.turnTodos) {
      record.turnTodos = record.turnTodos.map(t =>
        (t.endRound === -1 || t.endRound >= round) ? { ...t, executed: false } : t
      );
    }
    // 新回合重置装填武器攻击标记
    if (record.loadingAttackedThisRound) {
      record.loadingAttackedThisRound = {};
    }
    record.updatedAt = Date.now();
    save(records);
  },

  // =======================
  // 待消费优劣势标记（PendingAdvantageSource）CRUD
  // =======================

  /** 添加待消费优劣势标记（发起者赋予他人的一次性优劣势来源） */
  addPendingAdvantage(recordId: string, combatantId: string, source: Omit<PendingAdvantageSource, 'id' | 'consumed'>): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const full: PendingAdvantageSource = {
      ...source,
      id: crypto.randomUUID(),
      consumed: false,
    };
    record.combatants[idx] = {
      ...combatant,
      pendingAdvantageSources: [...(combatant.pendingAdvantageSources || []), full],
    };
    record.updatedAt = Date.now();
    save(records);
  },

  /** 批量添加待消费优劣势标记（原子写入，一次 save + notify） */
  addPendingAdvantages(recordId: string, combatantId: string, sources: Omit<PendingAdvantageSource, 'id' | 'consumed'>[]): void {
    if (!sources || sources.length === 0) return;
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const fulls: PendingAdvantageSource[] = sources.map(s => ({
      ...s,
      id: crypto.randomUUID(),
      consumed: false,
    }));
    record.combatants[idx] = {
      ...combatant,
      pendingAdvantageSources: [...(combatant.pendingAdvantageSources || []), ...fulls],
    };
    record.updatedAt = Date.now();
    save(records);
  },

  /** 批量消费待消费标记（检定确认后调用，置 consumed=true） */
  consumePendingAdvantage(recordId: string, combatantId: string, sourceIds: string[]): void {
    if (!sourceIds || sourceIds.length === 0) return;
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const list = combatant.pendingAdvantageSources || [];
    const idSet = new Set(sourceIds);
    let changed = false;
    const next = list.map(s => {
      if (idSet.has(s.id) && !s.consumed) { changed = true; return { ...s, consumed: true }; }
      return s;
    });
    if (!changed) return;
    record.combatants[idx] = { ...combatant, pendingAdvantageSources: next };
    record.updatedAt = Date.now();
    save(records);
  },

  /** 清理过期待消费标记（回合推进时调用） */
  clearExpiredAdvantage(recordId: string, combatantId: string, currentRound: number): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const list = combatant.pendingAdvantageSources || [];
    const next = list.filter(s => s.expireRound === -1 || s.expireRound >= currentRound);
    if (next.length === list.length) return;
    record.combatants[idx] = { ...combatant, pendingAdvantageSources: next };
    record.updatedAt = Date.now();
    save(records);
  },

  /**
   * 按 expireOnCombatantId 全局清理：
   *   当 combatantId 回合开始时，扫描 ALL 参战者的 pending 标记，
   *   所有 expireOnCombatantId === combatantId 的标记移除。
   *   用于「发出者的下一个回合前过期」（如协助动作）。
   */
  clearAdvantageByExpireCombatant(recordId: string, combatantId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    let changed = false;
    const nextCombatants = record.combatants.map(c => {
      const list = c.pendingAdvantageSources || [];
      const filtered = list.filter(s => s.expireOnCombatantId !== combatantId);
      if (filtered.length !== list.length) { changed = true; return { ...c, pendingAdvantageSources: filtered }; }
      return c;
    });
    if (!changed) return;
    record.combatants = nextCombatants;
    record.updatedAt = Date.now();
    save(records);
  },

  /** 读取未消费的待消费标记列表（只读） */
  getPendingAdvantages(combatant: Combatant): PendingAdvantageSource[] {
    return (combatant.pendingAdvantageSources || []).filter(s => !s.consumed);
  },

  // =======================
  // 次数型检定奖惩（check_modifier 次数通道）
  // 状态型奖惩由 statusManager 承载，不需要这些接口。
  // =======================

  /** 添加一条次数型检定奖惩（如激励：3 次） */
  addPendingCheckModifier(
    recordId: string,
    combatantId: string,
    mod: Omit<PendingCheckModifier, 'id' | 'consumed' | 'remainingUses' | 'totalUses'> & {
      uses?: number;
      remainingUses?: number;
    },
  ): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const total = Math.max(1, Math.floor(Number(mod.uses ?? mod.remainingUses ?? 1)) || 1);
    const full: PendingCheckModifier = {
      id: crypto.randomUUID(),
      fromId: mod.fromId,
      fromName: mod.fromName,
      reason: mod.reason,
      mode: mod.mode,
      dice: mod.dice,
      scene: mod.scene,
      forced: mod.mode === 'penalty' ? true : mod.forced === true,
      remainingUses: total,
      totalUses: total,
      consumed: false,
      createdRound: mod.createdRound,
      expireRound: mod.expireRound,
    };
    const combatant = record.combatants[idx];
    record.combatants[idx] = {
      ...combatant,
      pendingCheckModifiers: [...(combatant.pendingCheckModifiers || []), full],
    };
    record.updatedAt = Date.now();
    save(records);
  },

  /**
   * 消费次数型奖惩：每次命中 -1，归零即从列表移除。
   * 状态型奖惩不走这里（随状态自身过期/解除）。
   */
  consumePendingCheckModifiers(recordId: string, combatantId: string, ids: string[]): void {
    if (!ids || ids.length === 0) return;
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const list = combatant.pendingCheckModifiers || [];
    const idSet = new Set(ids);
    let changed = false;
    const next: PendingCheckModifier[] = [];
    for (const item of list) {
      if (!idSet.has(item.id)) { next.push(item); continue; }
      changed = true;
      const remaining = item.remainingUses - 1;
      if (remaining > 0) next.push({ ...item, remainingUses: remaining });
      // remaining <= 0：不推入 → 移除
    }
    if (!changed) return;
    record.combatants[idx] = { ...combatant, pendingCheckModifiers: next };
    record.updatedAt = Date.now();
    save(records);
  },

  /** 清理过期的次数型奖惩（回合推进时调用；expireRound=-1 永不过期） */
  clearExpiredCheckModifiers(recordId: string, combatantId: string, currentRound: number): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const list = combatant.pendingCheckModifiers || [];
    const next = list.filter(m => m.expireRound === -1 || m.expireRound >= currentRound);
    if (next.length === list.length) return;
    record.combatants[idx] = { ...combatant, pendingCheckModifiers: next };
    record.updatedAt = Date.now();
    save(records);
  },

  /** 手动移除一条次数型奖惩（DM 面板用） */
  removePendingCheckModifier(recordId: string, combatantId: string, id: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return;
    const combatant = record.combatants[idx];
    const list = combatant.pendingCheckModifiers || [];
    const next = list.filter(m => m.id !== id);
    if (next.length === list.length) return;
    record.combatants[idx] = { ...combatant, pendingCheckModifiers: next };
    record.updatedAt = Date.now();
    save(records);
  },

  /**
   * 清理已完成使命的死亡豁免待办。终止条件（D&D 5e）：
   *   - HP > 0       → 已恢复（用户指定的终止条件）
   *   - isDead       → 已死亡（3 次失败命中后由 applyDeathSaveResult 设置）
   *   - 成功 ≥ 3     → 稳定（无需再掷骰，仍昏迷）
   * 在 HP 变更 / 死亡豁免结算后调用。
   */
  cleanupDeathSaveTodos(recordId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record || !record.turnTodos) return;
    const before = record.turnTodos.length;
    record.turnTodos = record.turnTodos.filter(t => {
      if (t.type !== 'death_save') return true;
      const c = record.combatants.find(x => x.id === t.combatantId);
      if (!c) return false; // 参战者已删除
      if ((c.currentHp ?? 0) > 0) return false;
      if (c.isDead) return false;
      if ((c.deathSaveSuccesses ?? 0) >= 3) return false;
      return true;
    });
    if (record.turnTodos.length === before) return; // 无变化不触发额外渲染
    record.updatedAt = Date.now();
    save(records);
  },

  /**
   * 应用死亡豁免 d20 掷骰结果到适用者：
   *   1     → 失败 +2
   *   2-9   → 失败 +1
   *   10-19 → 成功 +1
   *   20    → HP=1、解除昏迷（终止条件命中，外部随后会调用 cleanupDeathSaveTodos）
   * 同时把对应待办标记为已执行。
   * 返回更新后的 combatant（供 UI 展示结果），找不到返回 null。
   */
  applyDeathSaveResult(
    recordId: string,
    todoId: string,
    roll: number,
  ): { combatant: Combatant; outcome: 'crit_fail' | 'fail' | 'success' | 'revive' } | null {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return null;
    const todo = record.turnTodos?.find(t => t.id === todoId);
    if (!todo) return null;
    // 每回合只能骰一次：已执行过的待办直接拒绝，避免重复累加
    if (todo.executed) return null;
    const idx = record.combatants.findIndex(c => c.id === todo.combatantId);
    if (idx === -1) return null;
    const c = record.combatants[idx];

    let outcome: 'crit_fail' | 'fail' | 'success' | 'revive';
    let failures = c.deathSaveFailures ?? 0;
    let successes = c.deathSaveSuccesses ?? 0;
    let nextHp = c.currentHp ?? 0;
    let nextUnconscious = c.isUnconscious ?? false;
    let nextDead = c.isDead ?? false;

    if (roll === 1) {
      failures += 2;
      outcome = 'crit_fail';
    } else if (roll <= 9) {
      failures += 1;
      outcome = 'fail';
    } else if (roll <= 19) {
      successes += 1;
      outcome = 'success';
    } else {
      // roll === 20：HP=1、解除昏迷
      nextHp = 1;
      nextUnconscious = false;
      outcome = 'revive';
    }
    // D&D 5e：3 次失败 → 死亡
    if (failures >= 3) {
      nextDead = true;
      nextUnconscious = false;
      nextHp = 0;
    }
    // 3 次成功 → 稳定（仍昏迷，但不再需要掷骰；保留待办由 DM 手动结束或被 cleanup 跳过）
    // 注意：稳定状态 HP 仍 = 0，不触发 cleanup；此处不做特殊处理，留给 DM 判定。

    record.combatants[idx] = {
      ...c,
      currentHp: nextHp,
      isUnconscious: nextUnconscious,
      isDead: nextDead,
      deathSaveFailures: failures,
      deathSaveSuccesses: successes,
    };
    // 标记待办已执行（下一轮 reset 时若仍昏迷且 HP=0 会复活）
    if (record.turnTodos) {
      record.turnTodos = record.turnTodos.map(t =>
        t.id === todoId ? { ...t, executed: true } : t
      );
    }
    // 复活 / 死亡 / 稳定 → 待办使命结束，立即清理（避免遗留 executed=true 的死待办）
    const shouldClean =
      nextHp > 0 || nextDead || successes >= 3;
    if (shouldClean && record.turnTodos) {
      record.turnTodos = record.turnTodos.filter(t => t.id !== todoId);
    }
    record.updatedAt = Date.now();
    save(records);
    return { combatant: record.combatants[idx], outcome };
  },

  /**
   * 专注豁免结算（一次性待办：处理完即移除）。
   * d20 + 体质调整值 vs DC（payload.dc，缺省 10）：
   * 成功 → 维持专注；失败 → 清除专注状态。体质豁免加值（NPC 熟练豁免）计提在调用方的 d20 之外时
   * 不在此处重复计算——此处只取属性调整值，熟练加值由待办创建方并入 payload.dc 或由 DM 手动折算。
   * 返回结算详情供弹窗展示；待办不存在 / 已移除时返回 null。
   */
  applyConcentrationSaveResult(
    recordId: string,
    todoId: string,
    roll: number,
  ): {
    maintained: boolean;
    d20: number;
    conMod: number;
    dc: number;
    total: number;
    spellName?: string;
    combatant: Combatant;
  } | null {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return null;
    const todo = record.turnTodos?.find(t => t.id === todoId);
    if (!todo || todo.type !== 'concentration_save') return null;
    const idx = record.combatants.findIndex(c => c.id === todo.combatantId);
    if (idx === -1) return null;
    const c = record.combatants[idx];

    const conMod = c.isPc && c.characterId
      ? characterStore.get(c.characterId)?.abilities.constitution.modifier ?? 0
      : Math.floor(((c.constitution ?? 10) - 10) / 2);
    const dc = todo.payload?.dc ?? 10;
    const total = roll + conMod;
    const maintained = total >= dc;

    // 一次性待办：无论成败都移除（成功=维持闭环，失败=专注已断）
    if (record.turnTodos) {
      record.turnTodos = record.turnTodos.filter(t => t.id !== todoId);
    }
    if (!maintained) {
      // 专注已断：先联动移除本次专注挂载的状态实例，再清字段
      this.removeConcentrationStatuses(c.concentration);
      record.combatants[idx] = { ...c, concentration: undefined };
      // 专注已断：该参战者的「维持专注」待办同步移除（与字段同生命周期）
      if (record.turnTodos) {
        record.turnTodos = record.turnTodos.filter(
          t => !(t.type === 'concentration_maintain' && t.combatantId === c.id)
        );
      }
    }
    record.updatedAt = Date.now();
    save(records);
    return {
      maintained,
      d20: roll,
      conMod,
      dc,
      total,
      spellName: todo.payload?.spellName,
      combatant: record.combatants[idx],
    };
  },

  /**
   * 专注状态清扫：失能 / 昏迷 / 死亡的参战者无法维持专注（D&D 5e）。
   * 在 HP 变更、死亡豁免结算、状态编辑后调用；有变更才 save，避免无谓 notify。
   */
  cleanupBrokenConcentration(recordId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    let changed = false;
    // 失能/昏迷/死亡的参战者：先联动移除各自专注挂载的状态实例，再清字段
    record.combatants.forEach(c => {
      if (c.concentration && (c.isDead || c.isUnconscious || c.isIncapacitated)) {
        this.removeConcentrationStatuses(c.concentration);
      }
    });
    record.combatants = record.combatants.map(c => {
      if (c.concentration && (c.isDead || c.isUnconscious || c.isIncapacitated)) {
        changed = true;
        return { ...c, concentration: undefined };
      }
      return c;
    });
    if (changed) {
      record.updatedAt = Date.now();
      save(records);
    }
    // 专注字段消失后，「维持专注」待办同步清扫（与字段同生命周期）
    this.cleanupConcentrationMaintainTodos(recordId);
  },

  /**
   * 结束专注维持（DM 点击「维持专注」待办 = 宣告法术 duration 到期或主动放弃）：
   * 清除参战者专注字段并移除待办，单一原子操作。
   */
  concludeConcentrationMaintain(recordId: string, todoId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record || !record.turnTodos) return;
    const todo = record.turnTodos.find(t => t.id === todoId);
    if (!todo || todo.type !== 'concentration_maintain') return;
    record.turnTodos = record.turnTodos.filter(t => t.id !== todoId);
    const target = record.combatants.find(c => c.id === todo.combatantId);
    // 主动结束（duration 到期/放弃）：联动移除本次专注挂载的状态实例
    this.removeConcentrationStatuses(target?.concentration);
    record.combatants = record.combatants.map(c =>
      c.id === todo.combatantId && c.concentration ? { ...c, concentration: undefined } : c
    );
    record.updatedAt = Date.now();
    save(records);
  },

  /** 专注维持待办清扫：专注字段已消失（被打断/替换/失能/参战者删除）的待办同步移除 */
  cleanupConcentrationMaintainTodos(recordId: string): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record || !record.turnTodos) return;
    const before = record.turnTodos.length;
    record.turnTodos = record.turnTodos.filter(t => {
      if (t.type !== 'concentration_maintain') return true;
      const c = record.combatants.find(x => x.id === t.combatantId);
      if (!c) return false;
      return !!c.concentration;
    });
    if (record.turnTodos.length === before) return;
    record.updatedAt = Date.now();
    save(records);
  },

  /**
   * NPC 自动死亡豁免掷骰（不依赖待办，直接掷骰并更新状态）。
   * 每轮昏迷 NPC 的回合被跳过时由系统调用。
   * 返回掷骰结果供调用方记录到先攻表格。
   */
  autoNpcDeathSave(
    recordId: string,
    combatantId: string,
  ): { roll: number; outcome: 'crit_fail' | 'fail' | 'success' | 'revive'; combatant: Combatant } | null {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return null;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return null;
    const c = record.combatants[idx];
    if (!c.isUnconscious || c.isDead) return null;

    const roll = Math.floor(Math.random() * 20) + 1;
    let failures = c.deathSaveFailures ?? 0;
    let successes = c.deathSaveSuccesses ?? 0;
    let nextHp = c.currentHp ?? 0;
    let nextUnconscious = c.isUnconscious ?? false;
    let nextDead = c.isDead ?? false;
    let outcome: 'crit_fail' | 'fail' | 'success' | 'revive';

    if (roll === 1) {
      failures += 2;
      outcome = 'crit_fail';
    } else if (roll <= 9) {
      failures += 1;
      outcome = 'fail';
    } else if (roll <= 19) {
      successes += 1;
      outcome = 'success';
    } else {
      nextHp = 1;
      nextUnconscious = false;
      outcome = 'revive';
    }
    if (failures >= 3) {
      nextDead = true;
      nextUnconscious = false;
      nextHp = 0;
    }

    record.combatants[idx] = {
      ...c,
      currentHp: nextHp,
      isUnconscious: nextUnconscious,
      isDead: nextDead,
      deathSaveFailures: failures,
      deathSaveSuccesses: successes,
    };
    record.updatedAt = Date.now();
    save(records);
    return { roll, outcome, combatant: record.combatants[idx] };
  },

  // ============================================================
  // 战斗层手持（参战者上；进战时从角色卡备战槽初始化，随记录回溯、结束不结算）
  // ============================================================

  /** 从角色卡备战槽生成参战者战斗层手持（双手武器同物品入双手；备战为空 → 空手） */
  initCombatantHands(character: Character): { heldLeft: HandSlot; heldRight: HandSlot } {
    const mk = (id: string | null | undefined): HandSlot => ({ state: 'ready', equipmentId: id ?? null });
    return { heldLeft: mk(character.readiedLeft), heldRight: mk(character.readiedRight) };
  },

  /** 读参战者某手槽（旧记录缺省视为空手） */
  getCombatantHandSlot(combatant: Combatant, hand: 'left' | 'right'): HandSlot {
    return (hand === 'left' ? combatant.heldLeft : combatant.heldRight) ?? { state: 'ready', equipmentId: null };
  },

  /**
   * 参战者武器可用性：state=ready + 物品存在于战斗背包（或源背包） + 双手武器需双手拿持
   * @param combatInventory 战斗背包（含拾取物）；不传则用角色源背包
   */
  isCombatantWeaponUsable(
    combatant: Combatant,
    hand: 'left' | 'right',
    combatInventory?: Equipment[],
  ): boolean {
    const slot = combatStore.getCombatantHandSlot(combatant, hand);
    if (slot.state !== 'ready' || !slot.equipmentId) return false;
    const source = combatInventory
      ?? (combatant.characterId ? characterStore.get(combatant.characterId)?.equipment : null)
      ?? [];
    const equip = source.find(e => (e.childId || e.id) === slot.equipmentId);
    if (!equip) return false;
    if (characterStore.isTwoHandedWeapon(equip)) {
      const other = combatStore.getCombatantHandSlot(combatant, hand === 'left' ? 'right' : 'left');
      return other.state === 'ready' && other.equipmentId === slot.equipmentId;
    }
    return true;
  },

  /** 写参战者某手槽（内部：combatants 数组替换 + save 通知） */
  setCombatantHandSlot(recordId: string, combatantId: string, hand: 'left' | 'right', slot: HandSlot): void {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx < 0) return;
    const c = record.combatants[idx];
    record.combatants[idx] = hand === 'left'
      ? { ...c, heldLeft: slot }
      : { ...c, heldRight: slot };
    record.updatedAt = Date.now();
    save(records);
  },

  /**
   * 切换参战者手持（互斥规则照搬原角色卡 holdItem：双手武器占两槽、盾牌/单手武器占一手）
   * @param combatInventory 战斗背包（含拾取物），用于物品查找与已穿戴检查
   */
  setCombatantHand(
    recordId: string,
    combatantId: string,
    equipId: string,
    hand: 'left' | 'right' | 'auto' = 'auto',
    combatInventory?: Equipment[],
  ): { success: boolean; message: string } {
    const record = combatStore.get(recordId);
    if (!record) return { success: false, message: '战斗记录不存在' };
    const combatant = record.combatants.find(c => c.id === combatantId);
    if (!combatant) return { success: false, message: '参战者不存在' };
    const character = combatant.characterId ? characterStore.get(combatant.characterId) : null;

    const source = combatInventory ?? character?.equipment ?? [];
    const equip = source.find(e => e.childId === equipId || e.id === equipId);
    if (!equip) return { success: false, message: '装备不存在' };
    // 已穿戴的盔甲/服装不能手持
    if (character) {
      const sid = equip.childId || equip.id;
      if (character.wornArmorId === sid || character.wornOutfitId === sid) {
        return { success: false, message: '已穿戴的盔甲/服装不能手持' };
      }
    }

    const slotId = equip.childId || equip.id;
    if (!slotId) return { success: false, message: '装备缺少唯一标识' };

    const left = combatStore.getCombatantHandSlot(combatant, 'left');
    const right = combatStore.getCombatantHandSlot(combatant, 'right');
    const canHold = (h: HandSlot): boolean => h.state === 'ready' && h.equipmentId === null;

    const alreadyInLeft = left.equipmentId === slotId;
    const alreadyInRight = right.equipmentId === slotId;
    if (alreadyInLeft && alreadyInRight) {
      return { success: true, message: `${equip.name} 已在双手` };
    }

    if ((alreadyInLeft || alreadyInRight) && hand !== 'auto') {
      const target = hand === 'left' ? left : right;
      if (target.equipmentId === slotId) {
        return { success: true, message: `${equip.name} 已在${hand === 'left' ? '左手' : '右手'}` };
      }
      if (canHold(target)) {
        combatStore.setCombatantHandSlot(recordId, combatantId, hand, { state: 'ready', equipmentId: slotId });
        return { success: true, message: `${equip.name} 已双手握持` };
      }
      return { success: false, message: hand === 'left' ? '左手不可用' : '右手不可用' };
    }

    if (hand === 'auto') {
      if (alreadyInLeft && canHold(right)) {
        combatStore.setCombatantHandSlot(recordId, combatantId, 'right', { state: 'ready', equipmentId: slotId });
        return { success: true, message: `${equip.name} 已双手握持` };
      }
      if (alreadyInRight && canHold(left)) {
        combatStore.setCombatantHandSlot(recordId, combatantId, 'left', { state: 'ready', equipmentId: slotId });
        return { success: true, message: `${equip.name} 已双手握持` };
      }
      if (canHold(right)) {
        combatStore.setCombatantHandSlot(recordId, combatantId, 'right', { state: 'ready', equipmentId: slotId });
        return { success: true, message: `${equip.name} 已持于右手` };
      } else if (canHold(left)) {
        combatStore.setCombatantHandSlot(recordId, combatantId, 'left', { state: 'ready', equipmentId: slotId });
        return { success: true, message: `${equip.name} 已持于左手` };
      }
      return { success: false, message: '没有空闲的手' };
    }

    const target = hand === 'left' ? left : right;
    if (!canHold(target)) {
      return { success: false, message: hand === 'left' ? '左手不可用' : '右手不可用' };
    }
    combatStore.setCombatantHandSlot(recordId, combatantId, hand, { state: 'ready', equipmentId: slotId });
    return { success: true, message: `${equip.name} 已持于${hand === 'left' ? '左手' : '右手'}` };
  },

  /** 放下参战者手中物品（hand='both' 清两手） */
  unsetCombatantHand(recordId: string, combatantId: string, hand: 'left' | 'right' | 'both'): { success: boolean; message: string } {
    const record = combatStore.get(recordId);
    if (!record) return { success: false, message: '战斗记录不存在' };
    const combatant = record.combatants.find(c => c.id === combatantId);
    if (!combatant) return { success: false, message: '参战者不存在' };

    let count = 0;
    if (hand === 'left' || hand === 'both') {
      if (combatStore.getCombatantHandSlot(combatant, 'left').equipmentId) {
        combatStore.setCombatantHandSlot(recordId, combatantId, 'left', { state: 'ready', equipmentId: null });
        count++;
      }
    }
    if (hand === 'right' || hand === 'both') {
      if (combatStore.getCombatantHandSlot(combatant, 'right').equipmentId) {
        combatStore.setCombatantHandSlot(recordId, combatantId, 'right', { state: 'ready', equipmentId: null });
        count++;
      }
    }
    if (count === 0) return { success: false, message: '手中没有物品' };
    return { success: true, message: `已放下 ${count} 件物品` };
  },

  /** 设置手状态（'action'=动作占位 | 'unavailable'=不可用 | 'ready'=恢复待用）；unavailable 会先放下物品 */
  setCombatantHandState(
    recordId: string,
    combatantId: string,
    hand: 'left' | 'right' | 'both',
    state: HandState,
  ): { success: boolean; message: string } {
    const record = combatStore.get(recordId);
    if (!record) return { success: false, message: '战斗记录不存在' };
    const combatant = record.combatants.find(c => c.id === combatantId);
    if (!combatant) return { success: false, message: '参战者不存在' };

    let count = 0;
    for (const h of ['left', 'right'] as const) {
      if (hand !== h && hand !== 'both') continue;
      const slot = combatStore.getCombatantHandSlot(combatant, h);
      if (slot.state === state) continue;
      if (state === 'ready') {
        // 恢复待用：任意状态（action/unavailable）都可恢复为空手 ready
        combatStore.setCombatantHandSlot(recordId, combatantId, h, { state: 'ready', equipmentId: null });
        count++;
      } else if (state === 'action') {
        if (slot.state !== 'ready' || slot.equipmentId) continue;
        combatStore.setCombatantHandSlot(recordId, combatantId, h, { state: 'action', equipmentId: null });
        count++;
      } else if (state === 'unavailable') {
        // 不可用：持有的物品先放下（双手物品另一手同清）
        if (slot.equipmentId) {
          const eid = slot.equipmentId;
          const other = combatStore.getCombatantHandSlot(combatant, h === 'left' ? 'right' : 'left');
          if (other.equipmentId === eid) {
            combatStore.setCombatantHandSlot(recordId, combatantId, h === 'left' ? 'right' : 'left', { state: 'ready', equipmentId: null });
          }
        }
        combatStore.setCombatantHandSlot(recordId, combatantId, h, { state: 'unavailable', equipmentId: null });
        count++;
      }
    }
    if (count === 0) {
      const label = state === 'ready' ? '没有需要恢复的手' : state === 'action' ? '没有可以设置动作的手' : '该手已处于不可用状态';
      return { success: false, message: label };
    }
    return { success: true, message: `已更新 ${count} 只手状态` };
  },
};

// =======================
// 战斗→角色变更回传协议
// =======================

/**
 * 角色状态快照（用于冲突检测）
 */
interface CharacterSnapshot {
  id: string;
  hp: number;
  equipment: Equipment[];
  updatedAt: number;
}

/**
 * 战斗回传结果
 */
export interface CombatCommitResult {
  characterId: string;
  /** HP 变更（最终值，非 delta） */
  hp: { before: number; after: number };
  /** 装备净变更条目 */
  equipmentDeltas: NetChangeEntry[];
  /** 状态变更（如昏迷/死亡，仅回传有意义的状态） */
  statusChanges: string[];
  /** 冲突标记 */
  conflicts: CommitConflict[];
}

/**
 * 回传冲突信息 */
export interface CommitConflict {
  field: 'equipment' | 'hp' | 'status';
  childId?: string;       // 装备冲突时的 childId
  combatValue: any;       // 战斗中的值
  currentValue: any;      // 角色卡当前值
  resolution: 'auto' | 'manual';  // 自动解决还是需要 DM 介入
}

/**
 * 可回传的状态白名单
 */
const COMMITTABLE_STATUSES = ['中毒', '束缚', '麻痹', '石化', '昏迷'] as const;

/**
 * 生成角色快照哈希
 */
function hashCharacter(character: Character | null): string {
  if (!character) return '';
  const snapshot: CharacterSnapshot = {
    id: character.id,
    hp: character.currentHp || 0,
    equipment: character.equipment || [],
    updatedAt: character.updatedAt || 0,
  };
  return JSON.stringify(snapshot);
}

/**
 * HP 回传策略：取最小值策略
 * 战斗让 HP 降了（受伤），角色卡可能已被 DM 手动治疗
 * 安全策略：取 min(战斗最终HP, 角色卡当前HP)
 */
function mergeHp(
  combatant: Combatant,
  character: Character,
): { finalHp: number; delta: number } {
  const combatHp = combatant.currentHp || 0;
  const characterHp = character.currentHp || 0;
  const finalHp = Math.min(combatHp, characterHp);
  const delta = finalHp - characterHp;
  return { finalHp, delta };
}

/**
 * 装备回传：childId 精确合并
 */
function mergeEquipment(
  character: Character,
  netChanges: NetChangeEntry[],
): Equipment[] {
  const currentEq = [...(character.equipment as Equipment[])] as Equipment[];
  
  for (const entry of netChanges) {
    const idx = currentEq.findIndex(e => 
      (e.childId || e.id) === entry.childId
    );
    
    if (entry.delta > 0) {
      // 获得物品：角色卡已有 → 叠加数量；没有 → 从 info.addedEq 插入
      if (idx >= 0) {
        currentEq[idx] = { 
          ...currentEq[idx], 
          quantity: (currentEq[idx].quantity ?? 1) + entry.delta 
        };
      } else if (entry.info.addedEq) {
        currentEq.push({ ...entry.info.addedEq, quantity: entry.delta });
      }
    } else if (entry.delta < 0) {
      // 失去物品：角色卡已有 → 减数量（不低于0）；没有 → 冲突标记
      if (idx >= 0) {
        const newQty = (currentEq[idx].quantity ?? 1) + entry.delta; // delta 是负数
        if (newQty <= 0) {
          currentEq.splice(idx, 1);  // 整件移除
        } else {
          currentEq[idx] = { ...currentEq[idx], quantity: newQty };
        }
      }
      // else: 角色卡里已经没这件东西了 → 无冲突，无需操作
    }
  }
  return currentEq;
}

/**
 * 状态回传：白名单过滤
 */
function mergeStatus(
  combatant: Combatant,
): string[] {
  const statusChanges: string[] = [];
  
  // 只回传白名单内的状态，其余丢弃
  if (combatant.isUnconscious) statusChanges.push('昏迷');
  if (combatant.isDead) statusChanges.push('死亡');
  if (combatant.isIncapacitated) statusChanges.push('失能');
  
  return statusChanges;
}

/**
 * 检测冲突
 */
function detectConflicts(
  character: Character,
  combatant: Combatant,
  netChanges: NetChangeEntry[],
): CommitConflict[] {
  const conflicts: CommitConflict[] = [];
  
  // HP 冲突检测
  const combatHp = combatant.currentHp || 0;
  const characterHp = character.currentHp || 0;
  if (combatHp !== characterHp) {
    conflicts.push({
      field: 'hp',
      combatValue: combatHp,
      currentValue: characterHp,
      resolution: 'auto', // HP 使用 min 策略自动解决
    });
  }
  
  // 装备冲突检测
  for (const entry of netChanges) {
    const characterEq = character.equipment?.find(e => 
      (e.childId || e.id) === entry.childId
    );
    if (characterEq) {
      const charQty = characterEq.quantity ?? 1;
      if (charQty !== entry.srcQty) {
        conflicts.push({
          field: 'equipment',
          childId: entry.childId,
          combatValue: entry.srcQty,
          currentValue: charQty,
          resolution: 'auto', // 装备使用精确合并自动解决
        });
      }
    }
  }
  
  return conflicts;
}

/**
 * 战斗结束变更回传协议：
 *   1. 快照锁定：战斗结束时拍一份 character 的当前状态作为 base
 *   2. 增量计算：以 base 为基准算 delta，而非以战斗开始时的快照
 *   3. 三路合并：如果 base 与当前 characterStore 中的角色一致 → 直接应用 delta
 *      如果不一致（战斗期间有人在角色卡页改了数据）→ 走冲突解决策略
 *   4. 原子写入：一次 saveCharacter 调用，不拆多步
 */
export function commitCombatToCharacter(
  recordId: string,
  combatantId: string,
): CombatCommitResult | null {
  const record = combatStore.get(recordId);
  if (!record) return null;
  
  const combatant = record.combatants.find(c => c.id === combatantId);
  if (!combatant || !combatant.characterId) return null;
  
  const character = characterStore.get(combatant.characterId);
  if (!character) return null;
  
  // 1. 计算装备净增量
  const equipmentChanges = record.equipmentChanges?.[combatantId];
  const equipmentDeltas = computeNetChanges(character, equipmentChanges);
  
  // 2. HP 合并
  const hpResult = mergeHp(combatant, character);
  
  // 3. 状态合并
  const statusChanges = mergeStatus(combatant);
  
  // 4. 冲突检测
  const conflicts = detectConflicts(character, combatant, equipmentDeltas);
  
  // 5. 构建结果
  const result: CombatCommitResult = {
    characterId: combatant.characterId,
    hp: {
      before: character.currentHp || 0,
      after: hpResult.finalHp,
    },
    equipmentDeltas,
    statusChanges,
    conflicts,
  };
  
  return result;
}

/**
 * 执行战斗回传：将变更应用到角色卡
 */
export function executeCombatCommit(
  recordId: string,
  combatantId: string,
): boolean {
  const result = commitCombatToCharacter(recordId, combatantId);
  if (!result) return false;
  
  const character = characterStore.get(result.characterId);
  if (!character) return false;
  
  // 1. 更新 HP
  const updatedCharacter = { ...character, currentHp: result.hp.after };
  
  // 2. 更新装备
  updatedCharacter.equipment = mergeEquipment(character, result.equipmentDeltas);
  
  // 3. 保存角色卡（原子写入）
  characterStore.save(updatedCharacter);
  
  return true;
}

/**
 * 批量回传所有 PC 的战斗变更
 */
export function commitAllPcCombatChanges(recordId: string): {
  success: string[];
  failed: string[];
  conflicts: string[];
} {
  const record = combatStore.get(recordId);
  if (!record) return { success: [], failed: [], conflicts: [] };
  
  const success: string[] = [];
  const failed: string[] = [];
  const conflicts: string[] = [];
  
  for (const combatant of record.combatants) {
    if (combatant.isPc && combatant.characterId) {
      const result = commitCombatToCharacter(recordId, combatant.id);
      if (result) {
        if (result.conflicts.length > 0) {
          conflicts.push(combatant.name);
        } else {
          const executed = executeCombatCommit(recordId, combatant.id);
          if (executed) {
            success.push(combatant.name);
          } else {
            failed.push(combatant.name);
          }
        }
      } else {
        failed.push(combatant.name);
      }
    }
  }
  
  return { success, failed, conflicts };
}

export default combatStore;
