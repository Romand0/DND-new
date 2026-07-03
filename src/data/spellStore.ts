// Spell Store - 后端 API + localStorage 缓存
import type { Spell } from '@/types/spell';
import initialSpells from '@/data/spells.json';
import * as api from '@/lib/api';

const STORAGE_KEY = 'DND-spells';
let listeners: (() => void)[] = [];

function loadFromCache(): Spell[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return initialSpells as Spell[];
}

function saveToCache(spells: Spell[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spells));
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
};
