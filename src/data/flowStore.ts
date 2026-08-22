import type { FlowDefinition } from '../types/flow';
import { serializeFlow, deserializeFlow } from '../types/flow';

const STORAGE_KEY = 'dnd-flow-library';
const VIEWPORT_KEY = 'dnd-flow-viewport-snapshots';
const REMOTE_CACHE_KEY = 'dnd-flow-remote';
const LEGACY_DRAFTS_KEY = 'dnd-flow-editor-drafts';
const LEGACY_AUTOSAVE_KEY = 'dnd-flow-editor-autosave';

/** 位置快照：编辑器画布/面板视图状态（按流程 ID 维度存储） */
export interface FlowViewportSnapshot {
  scrollX: number;
  scrollY: number;
  scale: number;
  translateX: number;
  translateY: number;
  showLeftPanel: boolean;
  showRightPanel: boolean;
}

type Listener = () => void;
let listeners: Listener[] = [];
let cache: FlowDefinition[] | null = null;

// 双源模式：本地草稿 + 远程正式版缓存
let localFlows: FlowDefinition[] = [];
let remoteFlows: FlowDefinition[] = [];
let remoteLoaded = false;

/** 读取本地认证 token（JWT） */
function getAuthToken(): string {
  try {
    return localStorage.getItem('auth_token') || '';
  } catch {
    return '';
  }
}

/** 一次性迁移：将旧版编辑器草稿键（dnd-flow-editor-drafts / dnd-flow-editor-autosave）合并进流程库后删除 */
function migrateLegacyDrafts() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DRAFTS_KEY) || '[]');
    let autosave: any = null;
    try {
      autosave = JSON.parse(localStorage.getItem(LEGACY_AUTOSAVE_KEY) || 'null');
    } catch {
      autosave = null;
    }
    const sources: any[] = Array.isArray(legacy) ? legacy : [];
    if (autosave?.flow?.id) sources.push({ flow: autosave.flow, updatedAt: autosave.flow.updatedAt });
    const flows = read();
    let changed = false;
    for (const s of sources) {
      const legacyFlow = s?.flow;
      if (!legacyFlow?.id || !Array.isArray(legacyFlow.nodes)) continue;
      if (flows.some(f => f.id === legacyFlow.id)) continue;
      flows.push({
        ...legacyFlow,
        name: legacyFlow.name || s?.name || '未命名流程',
        updatedAt: legacyFlow.updatedAt || s?.updatedAt || Date.now(),
      });
      changed = true;
    }
    if (changed) {
      cache = flows;
      localFlows = flows;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
    }
  } catch { /* ignore */ }
  try { localStorage.removeItem(LEGACY_DRAFTS_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LEGACY_AUTOSAVE_KEY); } catch { /* ignore */ }
}

// 跨标签页缓存失效
if (typeof window !== 'undefined') {
  migrateLegacyDrafts();
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      localFlows = read();
    }
    notify();
  });
}

function notify() { listeners.forEach(l => l()); }

function read(): FlowDefinition[] {
  if (cache) {
    localFlows = cache;
    return cache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch { cache = []; }
  localFlows = cache || [];
  return cache || [];
}

function write(flows: FlowDefinition[]) {
  cache = flows;
  localFlows = flows;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
  notify();
}

/** 合并视图：本地草稿 + 远程独有（本地优先） */
function mergedView(): FlowDefinition[] {
  const localIds = new Set(localFlows.map(f => f.id));
  const remoteOnly = remoteFlows.filter(f => !localIds.has(f.id));
  return [...localFlows, ...remoteOnly];
}

/** 是否未发布或已有本地修改的草稿 */
function isDraftDirty(flow: FlowDefinition): boolean {
  if (!flow.publishedVersion || flow.publishedVersion === 0) return true;
  return (flow.updatedAt ?? 0) > (flow.publishedAt ?? 0);
}

/** 流程库 store */
const flowStore = {
  /** 获取全部流程（本地草稿 + 远程独有合并视图） */
  getAll(): FlowDefinition[] {
    return mergedView();
  },

  /** 获取单个流程（本地优先） */
  getById(id: string): FlowDefinition | undefined {
    return localFlows.find(f => f.id === id) || remoteFlows.find(f => f.id === id);
  },

  /** 判断草稿状态（未发布 / 本地有修改） */
  isDraftDirty(flow: FlowDefinition): boolean {
    return isDraftDirty(flow);
  },

  /** 发布流程到 D1 */
  async publish(id: string): Promise<FlowDefinition | undefined> {
    const flow = localFlows.find(f => f.id === id);
    if (!flow) return undefined;
    const res = await fetch(`/api/flows/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(flow),
    });
    if (!res.ok) throw new Error(`发布失败: ${res.status}`);
    const published = await res.json();
    const updated = {
      ...flow,
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt ?? Math.floor(Date.now() / 1000), // 转换为秒级时间戳
    };
    const idx = localFlows.findIndex(f => f.id === id);
    localFlows[idx] = updated;
    write(localFlows);
    notify();
    return updated;
  },

  /** 从 D1 撤下 */
  async unpublish(id: string): Promise<void> {
    await fetch(`/api/flows/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` },
    });
    const flow = localFlows.find(f => f.id === id);
    if (flow) {
      flow.publishedVersion = 0;
      flow.publishedAt = null;
      write(localFlows);
      notify();
    }
  },

  /** 拉取远程正式版列表（缓存） */
  async fetchRemote(): Promise<void> {
    const res = await fetch('/api/flows', {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` },
    });
    if (!res.ok) return;
    remoteFlows = await res.json();
    remoteLoaded = true;
    try {
      localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(remoteFlows));
    } catch {}
    notify();
  },

  /** 拉取单个正式版覆盖本地 */
  async pullRemote(id: string): Promise<FlowDefinition | undefined> {
    const res = await fetch(`/api/flows/${id}`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` },
    });
    if (!res.ok) return undefined;
    const remote = await res.json();
    const idx = localFlows.findIndex(f => f.id === id);
    if (idx >= 0) {
      localFlows[idx] = remote;
    } else {
      localFlows.push(remote);
    }
    write(localFlows);
    notify();
    return remote;
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

  /** 变更流程 ID（类别/名称变更时） */
  retargetId(oldId: string, newId: string): FlowDefinition | undefined {
    const flows = read();
    const idx = flows.findIndex(f => f.id === oldId);
    if (idx === -1) return undefined;
    // 检查新 ID 冲突
    if (flows.some(f => f.id === newId)) return undefined;
    flows[idx] = { ...flows[idx], id: newId, updatedAt: Date.now() };
    write(flows);
    return flows[idx];
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

  /** 保存流程（upsert：存在则更新，不存在则追加，保留原 ID） */
  save(flow: FlowDefinition): FlowDefinition {
    const flows = read();
    const idx = flows.findIndex(f => f.id === flow.id);
    let saved: FlowDefinition;
    if (idx >= 0) {
      saved = { ...flows[idx], ...flow, updatedAt: Date.now() };
      flows[idx] = saved;
    } else {
      saved = { ...flow, updatedAt: flow.updatedAt ?? Date.now() };
      flows.push(saved);
    }
    write(flows);
    return saved;
  },

  /** 删除流程 */
  delete(id: string): boolean {
    const flows = read();
    const next = flows.filter(f => f.id !== id);
    if (next.length === flows.length) return false;
    write(next);
    return true;
  },

  /** 重命名流程 ID（原子操作：删除旧 key → 以新 key 写回） */
  renameId(oldId: string, newId: string): FlowDefinition | undefined {
    const flows = read();
    const idx = flows.findIndex(f => f.id === oldId);
    if (idx === -1) return undefined;
    if (flows.some(f => f.id === newId)) return undefined; // 新 ID 冲突
    flows[idx] = { ...flows[idx], id: newId, updatedAt: Date.now() };
    write(flows);
    return flows[idx];
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

  /** 保存位置快照（按流程 ID） */
  saveViewportSnapshot(flowId: string, snapshot: FlowViewportSnapshot): void {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY);
      const map: Record<string, FlowViewportSnapshot> = raw ? JSON.parse(raw) : {};
      map[flowId] = snapshot;
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
  },

  /** 恢复位置快照（按流程 ID） */
  getViewportSnapshot(flowId: string): FlowViewportSnapshot | null {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY);
      if (!raw) return null;
      const map: Record<string, FlowViewportSnapshot> = JSON.parse(raw);
      return map?.[flowId] ?? null;
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
