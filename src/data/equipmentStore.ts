// Equipment Store - 后端 API + localStorage 缓存
import type { EquipmentItem } from '@/types/equipment';
import initialEquipments from '@/data/equipments.json';
import * as api from '@/lib/api';

const STORAGE_KEY = 'DND-equipments';
let listeners: (() => void)[] = [];

function loadFromCache(): EquipmentItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return initialEquipments as EquipmentItem[];
}

function saveToCache(equipments: EquipmentItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(equipments));
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export const equipmentStore = {
  // 同步：从本地缓存读取（快速，用于 UI 渲染）
  getAll(): EquipmentItem[] {
    return loadFromCache();
  },

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

  // 异步：从后端加载并更新本地缓存
  async fetchAll(): Promise<EquipmentItem[]> {
    try {
      const data = await api.fetchAllEquipments<EquipmentItem[]>();
      saveToCache(data);
      return data;
    } catch (err) {
      console.error('[equipmentStore] 从后端加载失败:', err);
      return loadFromCache();
    }
  },

  // 异步：保存单个装备到后端
  async saveItem(item: EquipmentItem): Promise<EquipmentItem> {
    // 先更新本地缓存
    const all = loadFromCache();
    const index = all.findIndex((e) => e.id === item.id);
    let result: EquipmentItem;
    if (index >= 0) {
      result = { ...all[index], ...item };
      all[index] = result;
    } else {
      result = { ...item };
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
