// Equipment Store - 种子基线 + 后端 API（仅存覆盖/墓碑/自建行）
// getAll = 种子 ∪ 云端（覆盖/墓碑/自建），团组过滤后返回；getById/getByName 读合并全量（角色卡引用完整性）
import type { EquipmentItem } from '@/types/equipment';
import * as api from '@/lib/api';
import { scopedKey, getCampaignId } from '@/data/campaignScope';
import { filterByCampaignScope, subscribeLibraryScope } from '@/data/libraryScope';
import { getCachedSeed, loadSeed, subscribeSeed } from '@/data/seedLoader';
import { mergeBaseline } from '@/data/libraryMerge';

const STORAGE_KEY = 'DND-equipments';
let listeners: (() => void)[] = [];

// 模块级解析缓存：避免每次 getAll/getById 都同步 getItem + JSON.parse 全量云端行
// （getById 被 AC 重算 / combatStore / equipmentFactory 高频调用，单件查询不能触发全库重建）
let cloudCache: EquipmentItem[] | null = null;
let cloudCacheCampaign: string | null = null;
// 合并视图 memo：种子/云端任一引用变化才重算；getById/getByName 共享同一份索引
let mergedCache: {
  seedsRef: unknown[];
  cloudRef: EquipmentItem[];
  items: EquipmentItem[];
  byId: Map<string, EquipmentItem>;
  byName: Map<string, EquipmentItem>;
} | null = null;

function invalidateMerged(): void {
  mergedCache = null;
}

// 规则书集变化（切换团组/编辑规则书集）触发订阅页面刷新
subscribeLibraryScope(() => {
  cloudCache = null;
  invalidateMerged();
  notifyListeners();
});
// 种子就绪（首次加载/版本更新）触发刷新
subscribeSeed(() => notifyListeners());

// localStorage 缓存 = 云端行（覆盖/墓碑/自建），不含种子
function loadCloud(): EquipmentItem[] {
  const campaign = getCampaignId();
  if (cloudCache && cloudCacheCampaign === campaign) return cloudCache;
  try {
    const stored = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (stored) {
      cloudCache = JSON.parse(stored);
      cloudCacheCampaign = campaign;
      return cloudCache;
    }
  } catch {
    // ignore
  }
  cloudCache = [];
  cloudCacheCampaign = campaign;
  return cloudCache;
}

function saveCloud(equipments: EquipmentItem[]): void {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(equipments));
  cloudCache = equipments;
  invalidateMerged();
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

// 种子 ∪ 云端合并全量（未加载完成时仅云端）；结果 memo 化并携带 id/name 索引
const EMPTY_SEEDS: EquipmentItem[] = [];

function merged(): EquipmentItem[] {
  const seeds = getCachedSeed<EquipmentItem>('equipments') ?? EMPTY_SEEDS;
  if (mergedCache && mergedCache.seedsRef === seeds && mergedCache.cloudRef === cloudCache) {
    return mergedCache.items;
  }
  const cloud = loadCloud();
  const items = mergeBaseline(seeds, cloud).items;
  const byId = new Map<string, EquipmentItem>();
  const byName = new Map<string, EquipmentItem>();
  for (const it of items) {
    byId.set(it.id, it);
    // 与原 find 语义一致：重名保留数组中首个匹配
    if (!byName.has(it.name)) byName.set(it.name, it);
  }
  mergedCache = { seedsRef: seeds, cloudRef: cloud, items, byId, byName };
  return items;
}

function overlayId(seedId: string): string {
  return `ovl-${getCampaignId()}-${seedId}`;
}

export const equipmentStore = {
  // 合并视图（种子 ∪ 云端），按团组过滤
  getAll(): EquipmentItem[] {
    return filterByCampaignScope(merged());
  },

  // 全库视角（图鉴管理页）：种子 ∪ 云端全量
  getAllRaw(): EquipmentItem[] {
    return merged();
  },

  // 全量读：角色卡引用的条目即使在当前规则书集外也保持可用（引用完整性）
  getById(id: string): EquipmentItem | undefined {
    merged();
    return mergedCache?.byId.get(id);
  },

  getByName(name: string): EquipmentItem | undefined {
    merged();
    return mergedCache?.byName.get(name);
  },

  // 是否为纯种子条目（UI 据此隐藏编辑/删除，仅管理员显示「在 GitHub 编辑」）
  isSeedItem(id: string): boolean {
    return (getCachedSeed<EquipmentItem>('equipments') ?? []).some((s) => s.id === id);
  },

  // 保存合并后全量（服务端只应收到覆盖/墓碑/自建行——由 saveItem 派生保证）
  save(equipments: EquipmentItem[]): void {
    saveCloud(equipments);
  },

  subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },

  // 异步：预热种子 + 从后端加载云端行（覆盖/墓碑/自建）
  async fetchAll(): Promise<EquipmentItem[]> {
    await loadSeed('equipments');
    try {
      const data = await api.fetchAllEquipments<EquipmentItem[]>();
      saveCloud(data);
      return this.getAll();
    } catch (err) {
      console.error('[equipmentStore] 从后端加载失败:', err);
      return this.getAll();
    }
  },

  /**
   * 保存单个装备。种子条目编辑 → 派生覆盖行（独立 id + seedId）走云端私有通道；
   * 自建/覆盖行按原 id 更新；不存在则新建私有条目。
   */
  async saveItem(item: EquipmentItem): Promise<EquipmentItem> {
    const cloud = loadCloud();
    const seed = (getCachedSeed<EquipmentItem>('equipments') ?? []).find((s) => s.id === item.id);
    let result: EquipmentItem;

    if (seed) {
      // 编辑种子 → 派生/更新覆盖行
      const oid = overlayId(seed.id);
      const index = cloud.findIndex((e) => e.id === oid);
      result = {
        ...seed,
        ...item,
        id: oid,
        seedId: seed.id,
        campaignId: getCampaignId(),
      };
      if (index >= 0) cloud[index] = result;
      else cloud.push(result);
    } else {
      const index = cloud.findIndex((e) => e.id === item.id);
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
      await api.updateEquipment(result.id, result);
    } catch {
      try {
        await api.createEquipment(result);
      } catch (e) {
        console.error('[equipmentStore] 同步到后端失败:', e);
      }
    }
    return result;
  },

  /**
   * 删除单个装备。种子条目 → 写墓碑行（deleted）立即从合并视图剔除；
   * 自建/覆盖行 → 直接从云端移除。
   */
  async deleteItem(id: string): Promise<void> {
    const cloud = loadCloud();
    const seed = (getCachedSeed<EquipmentItem>('equipments') ?? []).find((s) => s.id === id);

    if (seed) {
      const oid = `del-${getCampaignId()}-${seed.id}`;
      const tombstone: EquipmentItem = {
        ...seed,
        id: oid,
        seedId: seed.id,
        deleted: true,
        campaignId: getCampaignId(),
      };
      const withoutOverlay = cloud.filter((e) => e.seedId !== seed.id);
      withoutOverlay.push(tombstone);
      saveCloud(withoutOverlay);
      try {
        // 先删可能存在的覆盖行，再写墓碑
        await api.deleteEquipment(overlayId(seed.id)).catch(() => {});
        await api.createEquipment(tombstone);
      } catch (e) {
        console.error('[equipmentStore] 写入墓碑失败:', e);
      }
      return;
    }

    const rest = cloud.filter((e) => e.id !== id);
    saveCloud(rest);
    try {
      await api.deleteEquipment(id);
    } catch (e) {
      console.error('[equipmentStore] 从后端删除失败:', e);
    }
  },
};
