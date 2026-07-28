import type { Combatant, CombatRecord, RoundAction } from '@/types/combat';
import { characterStore } from './characterStore';

const STORAGE_KEY = 'dnd-combat-records';
type Listener = () => void;

// =======================
// 内部状态（绝不暴露给外部）
// =======================
let listeners: Listener[] = [];

function notify(): void {
  listeners.forEach(listener => listener());
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
