import type { Combatant, CombatRecord, RoundAction, EquipmentChanges } from '@/types/combat';
import { characterStore } from './characterStore';
import type { Equipment, Character } from '@/types/character';

const STORAGE_KEY = 'dnd-combat-records';
type Listener = () => void;

// =======================
// 内部状态（绝不暴露给外部）
// =======================
let listeners: Listener[] = [];

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
 * 整理背包排序（与角色背包"整理背包"逻辑一致）：
 *   按分类顺序 ['武器','护甲','法器','工具','药水','杂物'] 排序，
 *   同分类内按名称 localeCompare 排序。
 *   每个不同 childId 的装备都是独立的，**不合并**。
 */
function sortInventory(list: Equipment[]): Equipment[] {
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
 * 派生战斗背包：
 *   战斗背包 = 角色背包（源） + 应用变更信息（漏斗） + 自动整理（排序，不合并）
 *
 * 规则（以 childId 为唯一主键，每个 childId 独立存在）：
 *   1. 复制角色源装备
 *   2. 应用 quantityDeltas（数量加减，减到 0 或以下 → 视为移除）
 *   3. 过滤 removedChildIds（完全移除）
 *   4. 追加 added（战斗中新增物品，保留新增的 childId）
 *   5. 自动整理：按分类+名称排序（不合并同名，每个 childId 独立）
 */
export function deriveCombatInventory(
  character: Character | null | undefined,
  changes?: EquipmentChanges | null,
): Equipment[] {
  const source: Equipment[] = (character?.equipment as Equipment[] | undefined) || [];
  const removedSet = new Set(changes?.removedChildIds || []);
  const qtyDeltas = changes?.quantityDeltas || {};
  const addedList = changes?.added || [];

  // 1 + 2 + 3：源装备应用数量变化，并过滤移除项
  const afterSource: Equipment[] = [];
  for (const rawEq of source) {
    const eq: Equipment = { ...rawEq };
    const cid = eq.childId || eq.id;
    if (!cid) continue;
    if (removedSet.has(cid)) continue; // 明确标记移除
    const delta = qtyDeltas[cid] || 0;
    if (delta !== 0) {
      const oldQty = (eq.quantity ?? 1);
      const newQty = oldQty + delta;
      if (newQty <= 0) continue; // 减到 0 → 视为完全移除
      eq.quantity = newQty;
    }
    afterSource.push(eq);
  }

  // 4：追加 added 列表（拾取/奖励物品）
  const mergedRaw: Equipment[] = [...afterSource];
  for (const a of addedList) {
    const data = (a.equipment || {}) as Partial<Equipment>;
    // 先展开快照数据，再用 a.childId 强制覆盖，避免快照内残留的 childId/id 覆盖漏斗主键
    const newEq: Equipment = {
      ...(data as any),
      id: (data.id as string) || a.childId,
      childId: a.childId,
      name: (data.name as string) || '未命名物品',
      quantity: (data.quantity as number) ?? 1,
      category: (data.category as string) || '杂项',
    };
    if (!newEq.quantity || newEq.quantity <= 0) newEq.quantity = 1;
    if (!newEq.name) newEq.name = '未命名物品';
    mergedRaw.push(newEq);
  }

  // 5：自动整理（排序，不合并）
  return sortInventory(mergedRaw);
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
  const source: Equipment[] = (character?.equipment as Equipment[] | undefined) || [];
  const removedSet = new Set(changes?.removedChildIds || []);
  const qtyDeltas = changes?.quantityDeltas || {};
  const addedList = changes?.added || [];

  const afterSource: Equipment[] = [];
  for (const rawEq of source) {
    const eq: Equipment = { ...rawEq };
    const cid = eq.childId || eq.id;
    if (!cid) continue;
    if (removedSet.has(cid)) continue;
    const delta = qtyDeltas[cid] || 0;
    if (delta !== 0) {
      const oldQty = (eq.quantity ?? 1);
      const newQty = oldQty + delta;
      if (newQty <= 0) continue;
      eq.quantity = newQty;
    }
    afterSource.push(eq);
  }

  for (const a of addedList) {
    const data = (a.equipment || {}) as Partial<Equipment>;
    const newEq: Equipment = {
      ...(data as any),
      id: (data.id as string) || a.childId,
      childId: a.childId,
      name: (data.name as string) || '未命名物品',
      quantity: (data.quantity as number) ?? 1,
      category: (data.category as string) || '杂项',
    };
    if (!newEq.quantity || newEq.quantity <= 0) newEq.quantity = 1;
    if (!newEq.name) newEq.name = '未命名物品';
    afterSource.push(newEq);
  }

  return afterSource; // 不排序
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records: unknown[] = JSON.parse(raw);
    return records.map((r: any) => ({
      id: r.id,
      title: r.title ?? '未命名战斗',
      combatants: (r.combatants ?? []).map((c: any) => {
        // 兜底：旧数据缺少 speed 时，从角色库回填（PC 参战者通常带有 characterId）
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
          isPc: c.isPc ?? false,
          characterId: c.characterId,
          note: c.note ?? '',
          speed,
          childId: c.childId,
          templateId: c.templateId,
          attacks: c.attacks,
        };
      }),
      rounds: r.rounds ?? [],
      mode: r.mode,
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
    return load().sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /**
   * 根据ID获取单个战斗记录
   */
  get(id: string): CombatRecord | null {
    return load().find(r => r.id === id) ?? null;
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
};

export default combatStore;
