// Character Option Store - 种子基线（嵌套分片展平）+ 后端 API（仅存覆盖/墓碑/自建行）
// getAll = filterByCampaignScope(种子 ∪ 云端)；种子驻留仓库 public/seed/，云端只存覆盖行。
import type { CharacterOption, OptionCategory } from '@/types/characterOption';
import * as api from '@/lib/api';
import { scopedKey, getCampaignId } from '@/data/campaignScope';
import { filterByCampaignScope, subscribeLibraryScope } from '@/data/libraryScope';
import { getCachedSeed, loadSeed, subscribeSeed } from '@/data/seedLoader';
import { mergeBaseline } from '@/data/libraryMerge';

const STORAGE_KEY = 'DND-character-options';
const storageKey = () => scopedKey(STORAGE_KEY);
let listenerFns: (() => void)[] = [];

// 规则书集变化触发刷新；种子就绪触发刷新
subscribeLibraryScope(() => notifyListeners());
subscribeSeed(() => notifyListeners());

// 种子分片是嵌套结构（种族含 subraces、职业含 subclasses），展平为与 D1 同形状的扁平条目。
// 与旧 options.json 的 flattenSeed 一致：亚种/子职业 id 加前缀防撞，继承父条目元数据。
function flattenSeedShards(shards: any[]): CharacterOption[] {
  const out: CharacterOption[] = [];
  for (const entry of shards) {
    // 分片里可能含 races/classes/backgrounds 混合（按 group 已拆分，但字段结构不同）
    const s = entry;
    if (Array.isArray(s.subraces)) {
      out.push({
        ...s,
        category: 'race',
        parentName: '',
        description: s.flavor || s.description || '',
        traits: s.traits || [],
      } as unknown as CharacterOption);
      for (const sub of s.subraces || []) {
        out.push({
          ...sub,
          id: sub.id?.startsWith('subrace-') ? sub.id : `subrace-${sub.id}`,
          category: 'subrace',
          parentName: s.name,
          description: '',
          traits: sub.traits || [],
          parentTraits: s.traits || [],
        } as unknown as CharacterOption);
      }
      continue;
    }
    if (Array.isArray(s.subclasses)) {
      out.push({
        ...s,
        category: 'class',
        parentName: '',
        description: s.flavor || s.description || '',
        traits: s.features || [],
        table: s.table || [],
        subclasses: (s.subclasses || []).map((sc: any) => sc.name),
      } as unknown as CharacterOption);
      for (const sc of s.subclasses || []) {
        out.push({
          ...sc,
          id: sc.id?.startsWith('subclass-') ? sc.id : `subclass-${sc.id}`,
          category: 'subclass',
          parentName: s.name,
          description: '',
          traits: sc.features || [],
        } as unknown as CharacterOption);
      }
      continue;
    }
    // 背景（或已扁平条目）
    out.push({
      ...s,
      category: s.category || 'background',
      parentName: s.parentName ?? '',
      traits: s.traits || [],
    } as unknown as CharacterOption);
  }
  return out;
}

// 进程内缓存：展平后的种子（避免每次读都全量处理）
let seedFlatCache: CharacterOption[] | null = null;
let cloudCache: CharacterOption[] | null = null;

function loadSeeds(): CharacterOption[] {
  if (seedFlatCache) return seedFlatCache;
  const raw = getCachedSeed<any>('options');
  if (!raw) return [];
  seedFlatCache = flattenSeedShards(raw);
  return seedFlatCache;
}

// 云端行缓存（覆盖/墓碑/自建），不含种子
function loadCloud(): CharacterOption[] {
  if (cloudCache) return cloudCache;
  try {
    const stored = localStorage.getItem(storageKey());
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        cloudCache = parsed;
        return cloudCache;
      }
    }
  } catch {
    // ignore
  }
  cloudCache = [];
  return cloudCache;
}

function saveCloud(options: CharacterOption[]): void {
  cloudCache = options;
  localStorage.setItem(storageKey(), JSON.stringify(options));
  notifyListeners();
}

function notifyListeners(): void {
  listenerFns.forEach((fn) => fn());
}

// 种子缓存需在版本变化时失效：subscribeSeed 触发时清空展平缓存
subscribeSeed(() => {
  seedFlatCache = null;
  notifyListeners();
});

function merged(): CharacterOption[] {
  return mergeBaseline(loadSeeds(), loadCloud()).items;
}

function overlayId(seedId: string): string {
  return `ovl-${getCampaignId()}-${seedId}`;
}

export const optionStore = {
  // 团组过滤视图（角色选择器/图鉴页用）
  getAll(): CharacterOption[] {
    return filterByCampaignScope(merged());
  },

  // 全库视角（图鉴管理页）
  getAllRaw(): CharacterOption[] {
    return merged();
  },

  get(id: string): CharacterOption | null {
    return merged().find((o) => o.id === id) ?? null;
  },

  // 是否为纯种子条目
  isSeedItem(id: string): boolean {
    return loadSeeds().some((s) => s.id === id);
  },

  getByCategory(category: OptionCategory): CharacterOption[] {
    return merged().filter((o) => o.category === category);
  },

  // 亚种按母种族过滤
  getSubraces(raceName: string): CharacterOption[] {
    return merged().filter((o) => o.category === 'subrace' && o.parentName === raceName);
  },

  getSubclasses(className: string): CharacterOption[] {
    return merged().filter((o) => o.category === 'subclass' && o.parentName === className);
  },

  getByName(name: string, category?: OptionCategory): CharacterOption | null {
    const all = merged().filter((o) => (category ? o.category === category : true));
    return all.find((o) => o.name === name) ?? null;
  },

  save(options: CharacterOption[]): void {
    saveCloud(options);
  },

  subscribe(fn: () => void): () => void {
    listenerFns.push(fn);
    return () => {
      listenerFns = listenerFns.filter((l) => l !== fn);
    };
  },

  // 保存单个选项：种子 → 派生覆盖行；自建/覆盖按原 id
  async saveItem(item: CharacterOption): Promise<CharacterOption> {
    const cloud = loadCloud();
    const seed = loadSeeds().find((s) => s.id === item.id);
    let result: CharacterOption;

    if (seed) {
      const oid = overlayId(seed.id);
      const index = cloud.findIndex((o) => o.id === oid);
      result = { ...seed, ...item, id: oid, seedId: seed.id, campaignId: getCampaignId() };
      if (index >= 0) cloud[index] = result;
      else cloud.push(result);
    } else {
      const index = cloud.findIndex((o) => o.id === item.id);
      if (index >= 0) {
        result = { ...cloud[index], ...item, campaignId: item.campaignId ?? cloud[index].campaignId };
        cloud[index] = result;
      } else {
        result = { ...item, campaignId: item.campaignId ?? getCampaignId() };
        cloud.push(result);
      }
    }
    saveCloud(cloud);

    try {
      await api.batchUpsertOptions([result]);
    } catch (e) {
      console.error('[optionStore] 同步到后端失败:', e);
    }
    return result;
  },

  // 删除单个选项：种子 → 写墓碑行；自建/覆盖 → 云端移除
  async deleteItem(id: string): Promise<void> {
    const cloud = loadCloud();
    const seed = loadSeeds().find((s) => s.id === id);
    if (seed) {
      const tombstone: CharacterOption = {
        ...seed,
        id: `del-${getCampaignId()}-${seed.id}`,
        seedId: seed.id,
        deleted: true,
        campaignId: getCampaignId(),
      };
      const withoutOverlay = cloud.filter((o) => o.seedId !== seed.id);
      withoutOverlay.push(tombstone);
      saveCloud(withoutOverlay);
      try {
        await api.batchUpsertOptions([tombstone]);
      } catch (e) {
        console.error('[optionStore] 墓碑写入失败:', e);
      }
      return;
    }
    saveCloud(cloud.filter((o) => o.id !== id));
    try {
      await api.batchUpsertOptions([{ id, deleted: true } as any]);
    } catch (e) {
      console.error('[optionStore] 云端删除失败:', e);
    }
  },

  // 已废弃：种子驻留仓库，不再推送种子到云端。保留空实现避免旧调用报错
  async syncToCloud(): Promise<number> {
    throw new Error('种子已驻留仓库，无需同步到云端');
  },

  // 预热种子 + 从云端拉取覆盖/墓碑/自建行
  async fetchAll(): Promise<CharacterOption[]> {
    await loadSeed('options');
    seedFlatCache = null;
    try {
      const data = await api.fetchAllOptions<CharacterOption[]>();
      if (Array.isArray(data)) {
        saveCloud(data);
        return this.getAll();
      }
      return this.getAll();
    } catch (err) {
      console.error('[optionStore] 从后端加载失败:', err);
      return this.getAll();
    }
  },
};

export default optionStore;
