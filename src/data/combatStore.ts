import type { Combatant, CombatRecord, RoundAction, EquipmentChanges, TurnTodo } from '@/types/combat';
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
    const ex = map.get(cid);
    if (ex) {
      ex.combatQty += delta;
    } else {
      // 未知 childId：按 srcQty=0 处理，delta 后 combatQty = delta（允许 added 后被 delta 改变量时触发）
      map.set(cid, { srcQty: 0, combatQty: delta });
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
    if (!raw) return [];
    const records: unknown[] = JSON.parse(raw);
    return records.map((r: any) => ({
      id: r.id,
      title: r.title ?? '未命名战斗',
      combatants: (r.combatants ?? []).map((c: any) => {
        // 兜底：旧数据缺少 speed 时，从角色库回填（PC 参战者通常带有 characterId）
        let actions = c.actions ?? 1;
        if (typeof actions !== 'number' || actions < 0) actions = 1;
        let speed = c.speed;
        if ((speed === undefined || speed === null) && c.characterId) {
          const char = characterStore.get(c.characterId);
          if (char?.speed) speed = char.speed;
        }
        return {
          id: c.id ?? crypto.randomUUID(),
          name: c.name ?? '未命名',
          initiative: c.initiative ?? 0,
          ac: c.ac ?? 0,
          maxHp: c.maxHp ?? 0,
          currentHp: c.currentHp ?? 0,
          tempHp: c.tempHp,
          isDead: c.isDead ?? false,
          isUnconscious: c.isUnconscious ?? false,
          deathSaveFailures: typeof c.deathSaveFailures === 'number' ? c.deathSaveFailures : 0,
          deathSaveSuccesses: typeof c.deathSaveSuccesses === 'number' ? c.deathSaveSuccesses : 0,
          isPc: c.isPc ?? false,
          characterId: c.characterId,
          note: c.note ?? '',
          speed,
          childId: c.childId,
          templateId: c.templateId,
          attacks: c.attacks,
          actions,
        };
      }),
      rounds: r.rounds ?? [],
      mode: r.mode,
      turnTodos: (r.turnTodos || []).map((t: any) => ({
        id: t.id ?? crypto.randomUUID(),
        combatantId: t.combatantId ?? '',
        name: t.name ?? '',
        type: t.type ?? null,
        startRound: typeof t.startRound === 'number' ? t.startRound : 0,
        endRound: typeof t.endRound === 'number' ? t.endRound : -1,
        executed: t.executed ?? false,
      })),
      // 关键：必须映射 equipmentChanges，否则 save 写入后 load 读取会丢失变更信息
      equipmentChanges: r.equipmentChanges as Record<string, EquipmentChanges> | undefined,
      createdAt: r.createdAt ?? Date.now(),
      updatedAt: r.updatedAt ?? Date.now(),
    }));
  } catch {
    return [];
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
   * 重置某参战者的可用动作数为 1（放映模式每回合开始时调用）。
   * @returns 重置后的可用动作数（恒为 1）；找不到参战者时返回 null
   */
  resetActions(recordId: string, combatantId: string): number | null {
    const records = load();
    const record = records.find(r => r.id === recordId);
    if (!record) return null;
    const idx = record.combatants.findIndex(c => c.id === combatantId);
    if (idx === -1) return null;
    record.combatants[idx] = { ...record.combatants[idx], actions: 1 };
    record.updatedAt = Date.now();
    save(records);
    return 1;
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
};

export default combatStore;
