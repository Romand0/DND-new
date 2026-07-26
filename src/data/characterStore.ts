import type { Combatant, CombatRecord, RoundAction } from '@/types/combat';
import { characterStore } from './characterStore';

const STORAGE_KEY = 'dnd-combat-records';
type Listener = () => void;

/**
 * 战斗记录存储核心
 * 完全对齐《战斗记录系统设计文档》数据模型
 */
const combatStore = {
  // ==================== 私有方法 ====================
  /** 通知所有订阅者数据变更 */
  _notify() {
    this._listeners.forEach(listener => listener());
  },

  /** 从localStorage加载所有战斗记录（兼容旧数据） */
  _load(): CombatRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const records: unknown[] = JSON.parse(raw);
      // 旧数据兼容：补全缺失字段
      return records.map((record: any) => ({
        id: record.id,
        title: record.title || '未命名战斗',
        combatants: (record.combatants || []).map((c: any) => ({
          id: c.id || crypto.randomUUID(),
          name: c.name || '未命名',
          initiative: c.initiative || 0,
          ac: c.ac ?? 0,
          maxHp: c.maxHp ?? 0,
          currentHp: c.currentHp ?? 0,
          isDead: c.isDead ?? false,
          isPc: c.isPc ?? false,
          characterId: c.characterId,
          note: c.note || '',
        })),
        rounds: record.rounds || [],
        createdAt: record.createdAt || Date.now(),
        updatedAt: record.updatedAt || Date.now(),
      }));
    } catch {
      return [];
    }
  },

  /** 保存所有战斗记录到localStorage */
  _save(records: CombatRecord[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      this._notify();
    } catch (e) {
      console.error('战斗记录保存失败:', e);
    }
  },

  // ==================== 公共方法 ====================
  /** 获取所有战斗记录（按更新时间倒序，最新在前） */
  getAll(): CombatRecord[] {
    return this._load().sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /** 根据ID获取单个战斗记录 */
  get(id: string): CombatRecord | null {
    return this._load().find(r => r.id === id) || null;
  },

  /**
   * 创建新战斗记录
   * @param title 战斗名称（对应设计文档CombatRecord.title）
   * @param combatants 参战者列表（不含id，由store自动生成）
   */
  create(title: string, combatants: Omit<Combatant, 'id'>[]): CombatRecord {
    const now = Date.now();
    const newRecord: CombatRecord = {
      id: crypto.randomUUID(),
      title: title.trim() || '未命名战斗',
      combatants: combatants.map(c => ({
        ...c,
        id: crypto.randomUUID(), // 为每个参战者生成唯一ID
        isDead: c.isDead ?? false,
        isPc: c.isPc ?? false,
      })),
      rounds: [], // 初始化为空回合记录（对齐设计文档RoundAction[]）
      createdAt: now,
      updatedAt: now,
    };
    const records = this._load();
    records.push(newRecord);
    this._save(records);
    return newRecord;
  },

  /**
   * 更新战斗记录
   * @param id 战斗记录ID
   * @param partial 待更新的字段（不可修改id/createdAt）
   */
  update(id: string, partial: Partial<Omit<CombatRecord, 'id' | 'createdAt'>>) {
    const records = this._load();
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return;

    records[index] = {
      ...records[index],
      ...partial,
      updatedAt: Date.now(),
    };
    this._save(records);
  },

  /** 删除指定战斗记录 */
  delete(id: string) {
    const records = this._load().filter(r => r.id !== id);
    this._save(records);
  },

  /** 清空所有战斗记录 */
  clear() {
    this._save([]);
  },

  // ==================== 导入导出 ====================
  /** 导出所有战斗记录为JSON文件 */
  exportToFile() {
    const records = this._load();
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnd-combat-records-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** 从JSON文件导入战斗记录 */
  importFromFile(file: File): Promise<CombatRecord[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const records: CombatRecord[] = JSON.parse(e.target?.result as string);
          // 校验导入数据合法性
          if (!Array.isArray(records)) throw new Error('导入文件格式错误');
          this._save(records);
          resolve(records);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  },

  // ==================== 订阅系统 ====================
  _listeners: Listener[] = [],

  /** 订阅数据变更，返回取消订阅函数 */
  subscribe(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  },
};

export default combatStore;
