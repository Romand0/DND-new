import type { Combatant, CombatRecord, RoundAction, EquipmentChanges, TurnTodo, PendingAdvantageSource } from '@/types/combat';
import { characterStore } from './characterStore';
import type { Equipment, Character } from '@/types/character';

const STORAGE_KEY = 'dnd-combat-records';
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
    if (e.key === STORAGE_KEY) recordsCache = null;
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
  const categoryOrder = ['武器', '护甲', '法器', '工具', '药水', '杂物'];
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

  // wornArmorId：必须在战斗背包存在
  if (character.wornArmorId) {
    const armor = inventory.find(e => (e.childId || e.id) === character.wornArmorId);
    if (armor) {
      const subtype = armor.subtype || '';
      const acValue = (armor as any).acValue as number | undefined;
      const baseAc = typeof acValue === 'number' ? acValue : 10;
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
  let ac = 10 + armorBonus;
  ac += dexCap === null ? dex : Math.min(dex, dexCap);

  // 手持盾牌（必须在战斗背包）
  const heldIds = [character.heldLeft?.equipmentId, character.heldRight?.equipmentId].filter(Boolean) as string[];
  for (const hid of heldIds) {
    const eq = inventory.find(e => (e.childId || e.id) === hid);
    if (eq?.subtype === '盾牌') {
      ac += 2;
      break;
    }
  }
  // 穿戴服装 + bonus（通常服装不提供 AC，但兼容已有逻辑）
  if (character.wornOutfitId && !character.wornArmorId) {
    const outfit = inventory.find(e => (e.childId || e.id) === character.wornOutfitId);
    if (outfit) {
      const acVal = (outfit as any).acValue as number | undefined;
      if (typeof acVal === 'number' && acVal > ac) ac = acVal;
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

function load(): CombatRecord[] {
  if (recordsCache) return recordsCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
        };
      });
      return {
        id: r.id,
        title: r.title ?? '未命名战斗',
        combatants,
        rounds: r.rounds ?? [],
        mode: r.mode,
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
        loadedWeapons: r.loadedWeapons && typeof r.loadedWeapons === 'object' ? { ...r.loadedWeapons } : undefined,
        loadingAttackedThisRound: r.loadingAttackedThisRound && typeof r.loadingAttackedThisRound === 'object' ? { ...r.loadingAttackedThisRound } : undefined,
        playbackState: r.playbackState && typeof r.playbackState === 'object' ? {
          started: !!r.playbackState.started,
          paused: !!r.playbackState.paused,
          currentTurn: r.playbackState.currentTurn && typeof r.playbackState.currentTurn === 'object' && typeof r.playbackState.currentTurn.round === 'number' && typeof r.playbackState.currentTurn.combatantId === 'string'
            ? { round: r.playbackState.currentTurn.round, combatantId: r.playbackState.currentTurn.combatantId }
            : null,
        } : undefined,
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
  recordsCache = records;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    notify();
  } catch (e) {
    console.error('战斗记录保存失败:', e);
  }
}

// =======================
// 对外 API（严格对齐设计文档）
// =======================
const combatStore = {
  /**
   * 获取所有战斗记录（按更新时间倒序）
   */
  getAll(): CombatRecord[] {
    return [...load()].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /**
   * 根据ID获取单个战斗记录
   */
  get(id: string): CombatRecord | null {
    const found = load().find(r => r.id === id) ?? null;
    if (!found) return null;
    // 浅拷贝：防止调用方 mutate 污染内存缓存（原实现每次 parse 天然隔离）
    return { ...found, combatants: [...found.combatants], rounds: [...found.rounds], turnTodos: found.turnTodos ? [...found.turnTodos] : undefined };
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
    save(list);
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
