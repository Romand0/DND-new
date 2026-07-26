import type { Combatant, CombatRecord, RoundAction } from '@/types/combat';
import { characterStore } from './characterStore';

const STORAGE_KEY = 'dnd-combat-records';
type Listener = () => void;

interface CombatStore {
  getAll(): CombatRecord[];
  get(id: string): CombatRecord | null;
  create(title: string, combatants: Omit<Combatant, 'id'>[]): CombatRecord;
  update(id: string, partial: Partial<Omit<CombatRecord, 'id' | 'createdAt'>>): void;
  delete(id: string): void;
  clear(): void;
  exportToFile(): void;
  importFromFile(file: File): Promise<CombatRecord[]>;
  subscribe(listener: Listener): () => void;
}

const combatStore: CombatStore & { _listeners: Listener[] } = {
  // ✅ 显式初始化，避免 TS1011
  _listeners: [],

  _notify() {
    this._listeners.forEach(listener => listener());
  },

  _load(): CombatRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const records: unknown[] = JSON.parse(raw);
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

  _save(records: CombatRecord[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      this._notify();
    } catch (e) {
      console.error('战斗记录保存失败:', e);
    }
  },

  getAll(): CombatRecord[] {
    return this._load().sort((a, b) => b.updatedAt - a.updatedAt);
  },

  get(id: string): CombatRecord | null {
    return this._load().find(r => r.id === id) || null;
  },

  create(title: string, combatants: Omit<Combatant, 'id'>[]): CombatRecord {
    const now = Date.now();
    const newRecord: CombatRecord = {
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
    const records = this._load();
    records.push(newRecord);
    this._save(records);
    return newRecord;
  },

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

  delete(id: string) {
    const records = this._load().filter(r => r.id !== id);
    this._save(records);
  },

  clear() {
    this._save([]);
  },

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

  importFromFile(file: File): Promise<CombatRecord[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const records: CombatRecord[] = JSON.parse(e.target?.result as string);
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

  subscribe(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  },
};

export default combatStore;
