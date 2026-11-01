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

// GitHub 源数据托底（public/spells-fallback.json 随 Pages 部署为同源静态资产）：
// 云端 D1 不可用/空库且本地无缓存时兜底。会话级 flag 防反复拉取。
let fallbackTried = false;

async function loadFallback(): Promise<Spell[]> {
  if (fallbackTried) return loadFromCache();
  fallbackTried = true;
  try {
    const res = await fetch('/spells-fallback.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Spell[];
    if (Array.isArray(data) && data.length > 0) {
      saveToCache(data);
      return data;
    }
  } catch (err) {
    console.error('[spellStore] 托底数据加载失败:', err);
  }
  return loadFromCache();
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
      if (Array.isArray(data) && data.length > 0) {
        saveToCache(data);
        return data;
      }
      // 云端空库（首次部署/未导入）→ 托底
      return await loadFallback();
    } catch (err) {
      console.error('[spellStore] 从后端加载失败:', err);
      // localStorage 有真缓存（区别于种子兜底）直接用；否则尝试托底，托底也失败再落种子
      if (localStorage.getItem(STORAGE_KEY)) return loadFromCache();
      return await loadFallback();
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
