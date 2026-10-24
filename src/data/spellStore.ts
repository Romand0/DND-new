// Spell Store - 后端 API + localStorage 缓存
import type { Spell } from '@/types/spell';
import initialSpells from '@/data/spells.json';
import * as api from '@/lib/api';

const STORAGE_KEY = 'DND-spells';
let listeners: (() => void)[] = [];

// 模块级解析缓存：库内容量达数百条时避免每次 getAll/getById 都全量 JSON.parse
let cachedSpells: Spell[] | null = null;

function loadFromCache(): Spell[] {
  if (cachedSpells) return cachedSpells;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cachedSpells = JSON.parse(stored);
      return cachedSpells;
    }
  } catch {
    // ignore
  }
  cachedSpells = initialSpells as Spell[];
  return cachedSpells;
}

function saveToCache(spells: Spell[]): void {
  // 防御：过滤缺 name 的畸形条目（任何来源的单条脏数据都不应污染整个库缓存）
  const valid = (Array.isArray(spells) ? spells : []).filter(s => s && typeof s === 'object' && !!s.name);
  cachedSpells = valid;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export const spellStore = {
  // 同步：从本地缓存读取
  getAll(): Spell[] {
    return loadFromCache();
  },

  getById(id: string): Spell | undefined {
    return loadFromCache().find((s) => s.id === id);
  },

  getByName(name: string): Spell | undefined {
    return loadFromCache().find((s) => s.name === name);
  },

  save(spells: Spell[]): void {
    saveToCache(spells);
  },

  subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },

  // 异步：从后端加载并更新本地缓存
  async fetchAll(): Promise<Spell[]> {
    try {
      const data = await api.fetchAllSpells<Spell[]>();
      saveToCache(data);
      return data;
    } catch (err) {
      console.error('[spellStore] 从后端加载失败:', err);
      return loadFromCache();
    }
  },

  // 异步：保存单个法术到后端
  async saveItem(spell: Spell): Promise<Spell> {
    const all = loadFromCache();
    const index = all.findIndex((s) => s.id === spell.id);
    let result: Spell;
    if (index >= 0) {
      result = { ...all[index], ...spell };
      all[index] = result;
    } else {
      result = { ...spell };
      all.push(result);
    }
    saveToCache(all);

    try {
      await api.updateSpell(spell.id, result);
    } catch {
      try {
        await api.createSpell(result);
      } catch (e) {
        console.error('[spellStore] 同步到后端失败:', e);
      }
    }
    return result;
  },

  // 异步：删除单个法术
  async deleteItem(id: string): Promise<void> {
    const all = loadFromCache().filter((s) => s.id !== id);
    saveToCache(all);
    try {
      await api.deleteSpell(id);
    } catch (e) {
      console.error('[spellStore] 从后端删除失败:', e);
    }
  },

  updateById(id: string, patch: Partial<Spell>): void {
    const all = loadFromCache();
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], ...patch };
    saveToCache(all);
  },
};
