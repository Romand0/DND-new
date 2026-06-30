import type { EquipmentItem } from '@/types/equipment';
import initialEquipments from '@/data/equipments.json';

const STORAGE_KEY = 'DND-equipments';
let listeners: (() => void)[] = [];

function loadEquipments(): EquipmentItem[] {
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

function saveEquipments(equipments: EquipmentItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(equipments));
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export const equipmentStore = {
  getAll(): EquipmentItem[] {
    return loadEquipments();
  },

  getById(id: string): EquipmentItem | undefined {
    return loadEquipments().find((e) => e.id === id);
  },

  getByName(name: string): EquipmentItem | undefined {
    return loadEquipments().find((e) => e.name === name);
  },

  save(equipments: EquipmentItem[]): void {
    saveEquipments(equipments);
  },

  subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
};
