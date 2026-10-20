import type { SpellFlowBinding, BindingCreateData } from '@/types/binding';
import * as api from '@/lib/api';

const STORAGE_KEY = 'dnd-spell-flow-bindings';
let listeners: (() => void)[] = [];
let cache: SpellFlowBinding[] | null = null;

type BindingEvent = {
  type: 'bind' | 'unbind';
  spellId: string;
  flowId: string;
};

type BindingListener = (event: BindingEvent) => void;

let bindingListeners: BindingListener[] = [];

function emitBindingEvent(event: BindingEvent): void {
  bindingListeners.forEach(cb => cb(event));
}

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

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      listeners.forEach(fn => fn());
    }
  });
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
    emitBindingEvent({ type: 'bind', spellId, flowId });
    return data;
  },

  async delete(id: string): Promise<void> {
    const binding = loadFromCache().find(b => b.id === id);
    try {
      await api.deleteSpellFlowBinding(id);
    } catch (e) {
      // 云端已无此行（他端已删或本地幽灵行）时视为成功并继续清理本地缓存，
      // 否则幽灵行永远无法删除（404 → 本地不清理 → 刷新后照旧显示）。
      // 其余错误（网络/认证）照常抛出。消息文本与 functions/api/bindings/[id].ts 的 404 分支对应。
      if (!(e instanceof Error) || e.message !== '绑定关系不存在') throw e;
    }
    saveToCache(loadFromCache().filter(b => b.id !== id));
    if (binding) {
      emitBindingEvent({ type: 'unbind', spellId: binding.spell_id, flowId: binding.flow_id });
    }
  },

  subscribe(listener: () => void): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },

  onBindingChange(listener: BindingListener): () => void {
    bindingListeners.push(listener);
    return () => { bindingListeners = bindingListeners.filter(l => l !== listener); };
  }
};