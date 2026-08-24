import type { FlowDefinition, FlowDraft, FlowPublishStatus } from '../types/flow';
import { computePublishStatus } from '../types/flow';
import { apiFetch } from '../lib/api';

/**
 * 深度清理对象中的 undefined 值
 * 解决 D1 数据库类型错误：Type 'undefined' not supported for value 'undefined'
 * 
 * @param obj 要清理的对象
 * @param fieldPath 字段路径，用于调试和类型判断
 * @returns 清理后的对象
 */
function deepCleanUndefined(obj: any, fieldPath: string = ''): any {
  // 基础类型处理
  if (obj === undefined || obj === null) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj
      .map((item, index) => deepCleanUndefined(item, `${fieldPath}[${index}]`))
      .filter(item => item !== null);
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        result[key] = deepCleanUndefined(val, `${fieldPath}.${key}`);
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * 清理 FlowDefinition 中的所有 undefined 值
 * 实现分层清理策略：先处理顶层字段，再处理嵌套结构
 */
function cleanFlowDefinition(flow: FlowDefinition): FlowDefinition {
  // 第一层：处理必填字段和类型转换
  const cleaned = {
    ...flow,
    publishedAt: flow.publishedAt ?? Math.floor(Date.now() / 1000),
    tags: flow.tags || [],
    version: flow.version ?? 1,
    status: flow.status || 'draft',
    description: flow.description || '',
    category: flow.category || 'custom',
    bindingsCount: flow.bindingsCount ?? 0,
  };
  
  // 第二层：深度清理 nodes 数组
  if (cleaned.nodes && Array.isArray(cleaned.nodes)) {
    cleaned.nodes = cleaned.nodes.map(node => ({
      ...node,
      config: deepCleanUndefined(node.config, `nodes.${node.id}.config`),
      notes: node.notes || '',
    }));
  }
  
  // 第三层：深度清理 edges 数组
  if (cleaned.edges && Array.isArray(cleaned.edges)) {
    cleaned.edges = cleaned.edges.map(edge => ({
      ...edge,
      dataMap: deepCleanUndefined(edge.dataMap, `edges.${edge.id}.dataMap`),
      label: edge.label || '',
      condition: edge.condition || '',
    }));
  }
  
  return cleaned;
}

// ====== 存储键 ======
const PUBLISHED_KEY = 'dnd-flow-published';   // 已发布版本地缓存
const DRAFTS_KEY    = 'dnd-flow-drafts';      // 草稿本地存储
const VIEWPORT_KEY = 'dnd-flow-viewport-snapshots';
const REMOTE_CACHE_KEY = 'dnd-flow-remote';
const LEGACY_DRAFTS_KEY = 'dnd-flow-editor-drafts';
const LEGACY_AUTOSAVE_KEY = 'dnd-flow-editor-autosave';
const STORAGE_KEY = 'dnd-flow-library';        // 向后兼容

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

// ====== 内部状态 ======
type Listener = () => void;
let listeners: Listener[] = [];
let publishedFlows: FlowDefinition[] = [];     // 远程已发布版缓存
let drafts: FlowDraft[] = [];                  // 本地草稿（parentId → FlowDraft）
let cache: FlowDefinition[] | null = null;     // 向后兼容的缓存
let localFlows: FlowDefinition[] = [];          // 向后兼容的本地流程
let remoteLoaded = false;

// ====== 工具函数 ======
function notify() { listeners.forEach(l => l()); }

function readPublished(): FlowDefinition[] {
  try {
    const raw = localStorage.getItem(PUBLISHED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writePublished(flows: FlowDefinition[]) {
  try {
    localStorage.setItem(PUBLISHED_KEY, JSON.stringify(flows));
  } catch { /* ignore */ }
}

function readDrafts(): FlowDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeDrafts(d: FlowDraft[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}

// 向后兼容的读取函数
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

// 一次性迁移：将旧版编辑器草稿键（dnd-flow-editor-drafts / dnd-flow-editor-autosave）合并进流程库后删除
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
    if (e.key === PUBLISHED_KEY || e.key === DRAFTS_KEY || e.key === STORAGE_KEY) {
      publishedFlows = readPublished();
      drafts = readDrafts();
      if (e.key === STORAGE_KEY) {
        cache = null;
        localFlows = read();
      }
      notify();
    }
  });
}

const flowStore = {

  // ──────────── 读取 ────────────

  /** 获取所有流程（已发布版 + 从未发布的新流程草稿） */
  getAll(): FlowDefinition[] {
    // 已发布版 + 尚无 publishedVersion 的纯新草稿
    const newDrafts = drafts
      .filter(d => !d.data.publishedVersion || d.data.publishedVersion === 0)
      .map(d => d.data);
    return [...publishedFlows, ...newDrafts];
  },

  /** 获取单个已发布版（只读，战斗引擎用此路径） */
  getPublished(id: string): FlowDefinition | undefined {
    return publishedFlows.find(f => f.id === id);
  },

  /** 获取草稿（如果存在） */
  getDraft(parentId: string): FlowDraft | undefined {
    return drafts.find(d => d.parentId === parentId);
  },

  /** 计算三态标签 */
  getPublishStatus(id: string): FlowPublishStatus {
    const flow = publishedFlows.find(f => f.id === id)
      || drafts.find(d => d.parentId === id)?.data;
    if (!flow) return { kind: 'draft' };
    return computePublishStatus(flow, drafts.find(d => d.parentId === id));
  },

  // ──────────── 草稿操作 ────────────

  /**
   * Fork：从已发布版派生草稿
   * - 如果草稿已存在，直接返回（幂等）
   * - 如果是未发布的新流程，草稿本身就是数据
   */
  fork(parentId: string): FlowDraft {
    const existing = drafts.find(d => d.parentId === parentId);
    if (existing) return existing;  // 唯一草稿约束：已存在则复用

    const published = publishedFlows.find(f => f.id === parentId);
    if (!published) throw new Error(`已发布流程 ${parentId} 不存在，无法 fork`);

    const draft: FlowDraft = {
      parentId,
      data: { ...published, updatedAt: Date.now() },  // 深拷贝已发布版作为起点
      forkedAt: Date.now(),
      updatedAt: Date.now(),
    };
    drafts.push(draft);
    writeDrafts(drafts);
    notify();
    return draft;
  },

  /** 保存草稿（编辑器每次改动调用） */
  saveDraft(parentId: string, patch: Partial<FlowDefinition>): FlowDraft | undefined {
    const idx = drafts.findIndex(d => d.parentId === parentId);
    if (idx === -1) return undefined;

    drafts[idx] = {
      ...drafts[idx],
      data: { ...drafts[idx].data, ...patch, updatedAt: Date.now() },
      updatedAt: Date.now(),
    };
    writeDrafts(drafts);
    notify();
    return drafts[idx];
  },

  /** 放弃草稿（回退到已发布版） */
  discardDraft(parentId: string): boolean {
    const next = drafts.filter(d => d.parentId !== parentId);
    if (next.length === drafts.length) return false;
    drafts = next;
    writeDrafts(drafts);
    notify();
    return true;
  },

  // ──────────── 发布 ────────────

  /**
   * 发布：草稿 → 覆写已发布版 → 清除草稿
   * 这是唯一修改 publishedFlows 的路径
   */
  async publish(parentId: string): Promise<FlowDefinition | undefined> {
    const draft = drafts.find(d => d.parentId === parentId);
    if (!draft) return undefined;

    // 深度清理
    const sanitizedFlow = cleanFlowDefinition(draft.data);

    // PUT 到 D1：覆写已发布版
    const published = await apiFetch(`/flows/${parentId}`, {
      method: 'PUT',
      body: JSON.stringify(sanitizedFlow),
    });

    // 更新本地已发布版缓存
    const updated: FlowDefinition = {
      ...draft.data,
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt ?? Math.floor(Date.now() / 1000),
    };

    const pIdx = publishedFlows.findIndex(f => f.id === parentId);
    if (pIdx >= 0) publishedFlows[pIdx] = updated;
    else publishedFlows.push(updated);
    writePublished(publishedFlows);

    // 清除草稿（发布后工位清空）
    drafts = drafts.filter(d => d.parentId !== parentId);
    writeDrafts(drafts);

    notify();
    return updated;
  },

  /** 撤下（从 D1 删除已发布版） */
  async unpublish(id: string): Promise<void> {
    await apiFetch(`/flows/${id}`, { method: 'DELETE' });
    publishedFlows = publishedFlows.filter(f => f.id !== id);
    // 同时清理关联草稿
    drafts = drafts.filter(d => d.parentId !== id);
    writePublished(publishedFlows);
    writeDrafts(drafts);
    notify();
  },

  // ──────────── 新建 ────────────

  /** 创建全新流程（纯草稿，尚未发布） */
  create(name: string = '未命名流程'): FlowDefinition {
    const id = 'flow-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const flow: FlowDefinition = {
      id, name, description: '', nodes: [], edges: [],
      tags: [], version: 1,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    // 新流程也作为草稿存储，parentId 等于自身 id
    const draft: FlowDraft = {
      parentId: id,
      data: flow,
      forkedAt: Date.now(),
      updatedAt: Date.now(),
    };
    drafts.push(draft);
    writeDrafts(drafts);
    notify();
    return flow;
  },

  // ──────────── 远程同步 ────────────

  /** 拉取远程已发布版列表（刷新缓存） */
  async fetchRemote(): Promise<void> {
    const flows = await apiFetch('/flows');
    publishedFlows = flows;
    remoteLoaded = true;
    writePublished(publishedFlows);
    notify();
  },

  // ──────────── Diff ────────────

  /** 计算草稿相对已发布版的变更（Fork 模式天然支持） */
  diff(parentId: string): { addedNodes: string[]; removedNodes: string[]; modifiedNodes: string[] } | null {
    const draft = drafts.find(d => d.parentId === parentId);
    const published = publishedFlows.find(f => f.id === parentId);
    if (!draft || !published) return null;

    const pubIds = new Set(published.nodes.map(n => n.id));
    const dftIds = new Set(draft.data.nodes.map(n => n.id));

    return {
      addedNodes:   draft.data.nodes.filter(n => !pubIds.has(n.id)).map(n => n.id),
      removedNodes: published.nodes.filter(n => !dftIds.has(n.id)).map(n => n.id),
      modifiedNodes: draft.data.nodes
        .filter(n => pubIds.has(n.id))
        .filter(n => {
          const orig = published.nodes.find(o => o.id === n.id);
          return orig && JSON.stringify(orig.config) !== JSON.stringify(n.config);
        })
        .map(n => n.id),
    };
  },

  // ──────────── 兼容性方法（保持向后兼容） ────────────

  /** 判断草稿状态（Fork 模式下重新实现） */
  isDraftDirty(flow: FlowDefinition): boolean {
    if (!flow.publishedVersion || flow.publishedVersion === 0) return true;
    const draft = drafts.find(d => d.parentId === flow.id);
    return draft ? (draft.updatedAt > (flow.publishedAt ?? 0)) : false;
  },

  /** 获取单个流程（本地优先） */
  getById(id: string): FlowDefinition | undefined {
    return this.getAll().find(f => f.id === id);
  },

  /** 发布流程到 D1（兼容原有接口） */
  async publishLegacy(id: string): Promise<FlowDefinition | undefined> {
    // 使用新的发布逻辑
    return this.publish(id);
  },

  /** 从 D1 撤下 */
  async unpublishLegacy(id: string): Promise<void> {
    await this.unpublish(id);
  },

  /** 拉取远程正式版列表（缓存） */
  async fetchRemoteLegacy(): Promise<void> {
    await this.fetchRemote();
  },

  /** 拉取单个正式版覆盖本地 */
  async pullRemote(id: string): Promise<FlowDefinition | undefined> {
    const remote = await apiFetch(`/flows/${id}`);
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

  /** 创建空流程（兼容原有接口） */
  createLegacy(name: string = '未命名流程'): FlowDefinition {
    const flow = this.create(name);
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
      const flow = JSON.parse(json) as FlowDefinition; // 直接解析，避免循环依赖
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