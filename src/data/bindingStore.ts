import type { SpellFlowBinding, BindingCreateData } from '@/types/binding';
import * as api from '@/lib/api';

const STORAGE_KEY = 'dnd-spell-flow-bindings';
let listeners: (() => void)[] = [];

function loadFromCache(): SpellFlowBinding[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToCache(bindings: SpellFlowBinding[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach(fn => fn());
}

export const bindingStore = {
  getAll(): SpellFlowBinding[] {
    return loadFromCache();
  },

  getBySpellId(spellId: string): SpellFlowBinding[] {
    return loadFromCache().filter(b => b.spell_id === spellId);
  },

  getByFlowId(flowId: string): SpellFlowBinding[] {
    return loadFromCache().filter(b => b.flow_id === flowId);
  },

  async create(spellId: string, flowId: string): Promise<SpellFlowBinding> {
    const data = await api.createSpellFlowBinding({ spell_id: spellId, flow_id: flowId });
    const bindings = [...loadFromCache(), data];
    saveToCache(bindings);
    notifyListeners();
    return data;
  },

  async delete(id: string): Promise<void> {
    await api.deleteSpellFlowBinding(id);
    const bindings = loadFromCache().filter(b => b.id !== id);
    saveToCache(bindings);
    notifyListeners();
  },

  subscribe(listener: () => void): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }
};