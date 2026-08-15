import type { FlowDefinition } from '@/types/flow';
import { serializeFlow, deserializeFlow } from '@/types/flow';

const STORAGE_KEY = 'dnd-flow-library';

type Listener = () => void;
let listeners: Listener[] = [];
let cache: FlowDefinition[] | null = null;

// 跨标签页缓存失效
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) cache = null;
    notify();
  });
}

function notify() { listeners.forEach(l => l()); }

function read(): FlowDefinition[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch { cache = []; }
  return cache;
}

function write(flows: FlowDefinition[]) {
  cache = flows;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
  notify();
}

/** 流程库 store */
const flowStore = {
  /** 获取全部流程 */
  getAll(): FlowDefinition[] {
    return read();
  },

  /** 获取单个流程 */
  getById(id: string): FlowDefinition | undefined {
    return read().find(f => f.id === id);
  },

  /** 创建空流程 */
  create(name: string = '未命名流程'): FlowDefinition {
    const flow: FlowDefinition = {
      id: 'flow-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name,
      description: '',
      nodes: [],
      edges: [],
      tags: [],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    write([...read(), flow]);
    return flow;
  },

  /** 更新流程（整体替换） */
  update(id: string, patch: Partial<FlowDefinition>): FlowDefinition | undefined {
    const flows = read();
    const idx = flows.findIndex(f => f.id === id);
    if (idx === -1) return undefined;
    flows[idx] = { ...flows[idx], ...patch, updatedAt: Date.now() };
    write(flows);
    return flows[idx];
  },

  /** 删除流程 */
  delete(id: string): boolean {
    const flows = read();
    const next = flows.filter(f => f.id !== id);
    if (next.length === flows.length) return false;
    write(next);
    return true;
  },

  /** 导入（从 JSON 字符串，返回导入后的 flow 或 null） */
  import(json: string): FlowDefinition | null {
    try {
      const flow = deserializeFlow(json);
      // 若 ID 冲突则重新生成
      if (read().some(f => f.id === flow.id)) {
        flow.id = 'flow-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      }
      write([...read(), flow]);
      return flow;
    } catch {
      return null;
    }
  },

  /** 订阅变更 */
  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
  },
};

export default flowStore;
