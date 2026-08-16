// 宝藏数据存储 —— localStorage + 内存缓存
import type { Treasure, DistributionRecord } from '@/types/treasure';

const STORAGE_KEY = 'dnd-treasures';
const DISTRIBUTION_KEY = 'dnd-treasure-distributions';
type Listener = () => void;

let listeners: Listener[] = [];
let cache: Treasure[] | null = null;
let distCache: DistributionRecord[] | null = null;

function notify(): void {
  listeners.forEach(l => l());
}

function load(): Treasure[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: unknown[] = JSON.parse(raw);
    cache = list.map((t: any) => ({
      id: t.id || '',
      title: t.title || '未命名宝藏',
      currency: t.currency || { pp: 0, gp: 0, sp: 0, cp: 0 },
      items: (t.items || []).map((it: any) => ({
        id: it.id || '',
        name: it.name || '',
        quantity: typeof it.quantity === 'number' ? it.quantity : 1,
        unitPrice:
          it.unitPrice == null
            ? undefined
            : typeof it.unitPrice === 'number'
              ? { amount: it.unitPrice, unit: 'cp' }
              : { amount: it.unitPrice.amount ?? 0, unit: it.unitPrice.unit ?? 'cp' },
        equipmentSnapshot: it.equipmentSnapshot,
      })),
      experience: typeof t.experience === 'number' ? t.experience : 0,
      createdAt: t.createdAt ?? Date.now(),
      updatedAt: t.updatedAt ?? Date.now(),
    }));
    return cache;
  } catch {
    return [];
  }
}

function save(list: Treasure[]): void {
  cache = list;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    notify();
  } catch (e) {
    console.error('宝藏保存失败:', e);
  }
}

function loadDistributions(): DistributionRecord[] {
  if (distCache) return distCache;
  try {
    const raw = localStorage.getItem(DISTRIBUTION_KEY);
    if (!raw) return [];
    distCache = JSON.parse(raw);
    return distCache;
  } catch {
    return [];
  }
}

function saveDistributions(list: DistributionRecord[]): void {
  distCache = list;
  try {
    localStorage.setItem(DISTRIBUTION_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('分配记录保存失败:', e);
  }
}

const treasureStore = {
  getAll(): Treasure[] {
    return [...load()].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  get(id: string): Treasure | null {
    return load().find(t => t.id === id) ?? null;
  },

  create(title: string): Treasure {
    const now = Date.now();
    const t: Treasure = {
      id: crypto.randomUUID(),
      title: title.trim() || '未命名宝藏',
      currency: { pp: 0, gp: 0, sp: 0, cp: 0 },
      items: [],
      experience: 0,
      createdAt: now,
      updatedAt: now,
    };
    const list = load();
    list.push(t);
    save(list);
    return t;
  },

  update(id: string, partial: Partial<Omit<Treasure, 'id' | 'createdAt'>>): void {
    const list = load();
    const idx = list.findIndex(t => t.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...partial, updatedAt: Date.now() };
    save(list);
  },

  delete(id: string): void {
    save(load().filter(t => t.id !== id));
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
  },

  // 分配记录
  getDistributions(treasureId: string): DistributionRecord[] {
    return loadDistributions().filter(d => d.treasureId === treasureId);
  },

  recordDistribution(record: DistributionRecord): void {
    const list = loadDistributions();
    list.push(record);
    saveDistributions(list);
  },
};

export default treasureStore;
