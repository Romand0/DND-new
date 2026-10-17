// Character Option Store - 后端 API + localStorage 缓存 + 种子兜底
import type { CharacterOption, OptionCategory, ClassTableRow, OptionTrait } from '@/types/characterOption';
import seed from '@/data/options.json';
import * as api from '@/lib/api';

const STORAGE_KEY = 'DND-character-options';
let listenerFns: (() => void)[] = [];

// 种子 JSON 是嵌套结构（races 内含 subraces、classes 内含 subclasses），
// 展平为与 D1 character_options 表同形状的扁平条目；条目已自带
// id/category/parentName（提取脚本产出），亚种/子职业 id 加前缀防撞
function flattenSeed(): CharacterOption[] {
  const s = seed as any;
  const out: CharacterOption[] = [];

  for (const r of s.races || []) {
    out.push({
      ...r,
      category: 'race',
      parentName: '',
      description: r.flavor || '',
      traits: r.traits || [],
    } as unknown as CharacterOption);
    for (const sub of r.subraces || []) {
      out.push({
        ...sub,
        id: `subrace-${sub.id}`,
        category: 'subrace',
        parentName: r.name,
        description: '',
        traits: sub.traits || [],
        parentTraits: r.traits || [],
      } as unknown as CharacterOption);
    }
  }

  for (const b of s.backgrounds || []) {
    out.push({
      ...b,
      category: 'background',
      parentName: '',
      traits: [],
      feature: b.feature || undefined,
      characteristics: b.characteristics || [],
    } as unknown as CharacterOption);
  }

  for (const c of s.classes || []) {
    out.push({
      ...c,
      category: 'class',
      parentName: '',
      description: c.flavor || '',
      traits: c.features || [],
      table: c.table || [],
      subclasses: (c.subclasses || []).map((sc: any) => sc.name),
    } as unknown as CharacterOption);
    for (const sc of c.subclasses || []) {
      out.push({
        ...sc,
        id: `subclass-${sc.id}`,
        category: 'subclass',
        parentName: c.name,
        description: '',
        traits: sc.features || [],
      } as unknown as CharacterOption);
    }
  }
  return out;
}

const SEED_OPTIONS = flattenSeed();

function loadFromCache(): CharacterOption[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return SEED_OPTIONS;
}

function saveToCache(options: CharacterOption[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  notifyListeners();
}

function notifyListeners(): void {
  listenerFns.forEach((fn) => fn());
}

export const optionStore = {
  getAll(): CharacterOption[] {
    return loadFromCache();
  },

  get(id: string): CharacterOption | null {
    return loadFromCache().find((o) => o.id === id) ?? null;
  },

  getByCategory(category: OptionCategory): CharacterOption[] {
    return loadFromCache().filter((o) => o.category === category);
  },

  // 亚种按母种族过滤
  getSubraces(raceName: string): CharacterOption[] {
    return loadFromCache().filter((o) => o.category === 'subrace' && o.parentName === raceName);
  },

  getSubclasses(className: string): CharacterOption[] {
    return loadFromCache().filter((o) => o.category === 'subclass' && o.parentName === className);
  },

  getByName(name: string, category?: OptionCategory): CharacterOption | null {
    const all = loadFromCache().filter((o) => (category ? o.category === category : true));
    return all.find((o) => o.name === name) ?? null;
  },

  save(options: CharacterOption[]): void {
    saveToCache(options);
  },

  subscribe(fn: () => void): () => void {
    listenerFns.push(fn);
    return () => {
      listenerFns = listenerFns.filter((l) => l !== fn);
    };
  },

  // 种子条目同步到云端（供数据管理页触发）
  async syncToCloud(): Promise<number> {
    const res = await api.batchUpsertOptions(SEED_OPTIONS);
    return res.count;
  },

  async fetchAll(): Promise<CharacterOption[]> {
    try {
      const data = await api.fetchAllOptions<CharacterOption[]>();
      if (Array.isArray(data) && data.length > 0) {
        saveToCache(data);
        return data;
      }
      return loadFromCache();
    } catch (err) {
      console.error('[optionStore] 从后端加载失败:', err);
      return loadFromCache();
    }
  },
};

export default optionStore;
