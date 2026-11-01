// Equipment Store - 后端 API + localStorage 缓存
// 团组视图：getAll 返回「本团组私有 ∪ 规则书集出版物」过滤视图；getById/getByName 全量读（角色卡引用完整性）
import type { EquipmentItem } from '@/types/equipment';
import initialEquipments from '@/data/equipments.json';
import * as api from '@/lib/api';
import { scopedKey, getCampaignId } from '@/data/campaignScope';
import { filterByCampaignScope, subscribeLibraryScope } from '@/data/libraryScope';

const STORAGE_KEY = 'DND-equipments';
let listeners: (() => void)[] = [];

// 规则书集变化（切换团组/编辑规则书集）触发订阅页面刷新
subscribeLibraryScope(() => notifyListeners());

function loadFromCache(): EquipmentItem[] {
  try {
    const stored = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return initialEquipments as EquipmentItem[];
}

function saveToCache(equipments: EquipmentItem[]): void {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(equipments));
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export const equipmentStore = {
  // 同步：从本地缓存读取团组过滤视图（快速，用于 UI 渲染）
  getAll(): EquipmentItem[] {
    return filterByCampaignScope(loadFromCache());
  },

  // 全库视角（图鉴管理页维护出版物与全部条目）
  getAllRaw(): EquipmentItem[] {
    return loadFromCache();
  },

  // 全量读：角色卡引用的条目即使不在当前规则书集内也保持可用（引用完整性）
  getById(id: string): EquipmentItem | undefined {
    return loadFromCache().find((e) => e.id === id);
  },

  getByName(name: string): EquipmentItem | undefined {
    return loadFromCache().find((e) => e.name === name);
  },

  save(equipments: EquipmentItem[]): void {
    saveToCache(equipments);
  },

  subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },

  // 异步：从后端加载当前团组视图并更新本地缓存
  async fetchAll(): Promise<EquipmentItem[]> {
    try {
      const data = await api.fetchAllEquipments<EquipmentItem[]>();
      saveToCache(data);
      return data;
    } catch (err) {
      console.error('[equipmentStore] 从后端加载失败:', err);
      return this.getAll();
    }
  },

  // 异步：保存单个装备到后端（新条目默认归当前团组私有；出版物条目显式传 campaignId=null）
  async saveItem(item: EquipmentItem): Promise<EquipmentItem> {
    // 先更新本地缓存
    const all = loadFromCache();
    const index = all.findIndex((e) => e.id === item.id);
    let result: EquipmentItem;
    if (index >= 0) {
      result = { ...all[index], ...item, campaignId: item.campaignId ?? all[index].campaignId };
      all[index] = result;
    } else {
      result = { ...item, campaignId: item.campaignId ?? getCampaignId() };
      all.push(result);
    }
    saveToCache(all);

    // 同步到后端
    try {
      await api.updateEquipment(item.id, result);
    } catch {
      try {
        await api.createEquipment(result);
      } catch (e) {
        console.error('[equipmentStore] 同步到后端失败:', e);
      }
    }
    return result;
  },

  // 异步：删除单个装备
  async deleteItem(id: string): Promise<void> {
    const all = loadFromCache().filter((e) => e.id !== id);
    saveToCache(all);
    try {
      await api.deleteEquipment(id);
    } catch (e) {
      console.error('[equipmentStore] 从后端删除失败:', e);
    }
  },
};
