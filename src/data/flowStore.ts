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
    const drafts = raw ? JSON.parse(raw) : [];
    
    // 去重逻辑：按 parentId 分组，保留最新的草稿
    const draftMap = new Map<string, FlowDraft>();
    drafts.forEach(draft => {
      const existing = draftMap.get(draft.parentId);
      if (!existing || draft.updatedAt > existing.updatedAt) {
        draftMap.set(draft.parentId, draft);
      }
    });
    
    // 确保所有草稿的 publishedVersion 为 0
    const uniqueDrafts = Array.from(draftMap.values()).map((draft: FlowDraft) => ({
      ...draft,
      data: {
        ...draft.data,
        publishedVersion: 0, // 草稿的 publishedVersion 必须为 0
      },
    }));
    
    console.log('readDrafts() - 原始草稿数:', drafts.length);
    console.log('readDrafts() - 去重后草稿数:', uniqueDrafts.length);
    
    return uniqueDrafts;
  } catch { return []; }
}

function writeDrafts(d: FlowDraft[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}





// 初始化本地数据
if (typeof window !== 'undefined') {
  // 初始化草稿数据
  drafts = readDrafts();
  publishedFlows = readPublished();
}

const flowStore = {

  // ──────────── 读取 ────────────

  /** 获取所有流程（已发布版 + 所有草稿） */
  getAll(): FlowDefinition[] {
    // 已发布版 + 所有草稿（包括未发布的和已发布的草稿）
    const allDrafts = drafts.map(d => ({
      ...d.data,
      publishedVersion: 0, // 草稿的 publishedVersion 必须为 0
    }));
    
    // 去重逻辑：确保每个流程 ID 只显示一次
    const resultMap = new Map<string, FlowDefinition>();
    
    // 先添加已发布流程
    publishedFlows.forEach(flow => {
      resultMap.set(flow.id, flow);
    });
    
    // 再添加草稿，覆盖已发布流程（草稿优先）
    allDrafts.forEach(draft => {
      resultMap.set(draft.id, draft);
    });
    
    const result = Array.from(resultMap.values());
    
    console.log('getAll() - publishedFlows:', publishedFlows.length);
    console.log('getAll() - drafts:', drafts.length);
    console.log('getAll() - allDrafts:', allDrafts.length);
    console.log('getAll() - result (去重后):', result.length);
    
    return result;
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
   * 进入沙盒环境：确保流程有沙盒环境
   * - 如果流程从未发布过，沙盒就是草稿本身
   * - 如果流程已发布，沙盒基于最新发布态创建
   * - 沙盒环境长期存在，清空后可以重新进入
   */
  enterSandbox(parentId: string): FlowDefinition {
    const existing = drafts.find(d => d.parentId === parentId);
    if (existing) return existing.data;  // 沙盒已存在，直接返回

    const published = publishedFlows.find(f => f.id === parentId);
    if (!published) {
      throw new Error(`流程 ${parentId} 不存在，无法进入沙盒`);
    }

    // 创建沙盒环境（基于最新发布态）
    const sandbox: FlowDraft = {
      parentId,
      data: { ...published, updatedAt: Date.now() },
      forkedAt: Date.now(),
      updatedAt: Date.now(),
    };
    drafts.push(sandbox);
    writeDrafts(drafts);
    notify();
    return sandbox.data;
  },

  /** 退出沙盒环境：清空沙盒内容 */
  exitSandbox(parentId: string): boolean {
    return this.clearDraft(parentId);
  },

  /** 重置沙盒环境：用当前发布态重置沙盒 */
  resetSandbox(parentId: string): FlowDefinition | undefined {
    const published = publishedFlows.find(f => f.id === parentId);
    if (!published) return undefined;

    // 清空现有沙盒
    this.clearDraft(parentId);

    // 重新创建沙盒
    const sandbox: FlowDraft = {
      parentId,
      data: { ...published, updatedAt: Date.now() },
      forkedAt: Date.now(),
      updatedAt: Date.now(),
    };
    drafts.push(sandbox);
    writeDrafts(drafts);
    notify();
    return sandbox.data;
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

  /** 清空草稿（编辑器主动清空） */
  clearDraft(parentId: string): boolean {
    const next = drafts.filter(d => d.parentId !== parentId);
    if (next.length === drafts.length) return false;
    drafts = next;
    writeDrafts(drafts);
    notify();
    return true;
  },

  /** 用已发布版覆盖草稿（清空草稿后从flow表复制） */
  async overwriteDraftFromPublished(parentId: string): Promise<FlowDefinition | undefined> {
    const published = publishedFlows.find(f => f.id === parentId);
    if (!published) return undefined;

    // 清除草稿
    this.clearDraft(parentId);

    // 创建新草稿，基于已发布版
    const draft: FlowDraft = {
      parentId,
      data: { ...published, updatedAt: Date.now() },
      forkedAt: Date.now(),
      updatedAt: Date.now(),
    };
    drafts.push(draft);
    writeDrafts(drafts);
    notify();
    return draft.data;
  },

  // ──────────── 发布 ────────────

  /**
   * 发布：草稿 → 覆写已发布版 → 清除草稿
   * 这是唯一修改 publishedFlows 的路径
   */
  async publish(parentId: string): Promise<FlowDefinition | undefined> {
    const draft = drafts.find(d => d.parentId === parentId);
    if (!draft) return undefined;

    // 验证草稿
    const validation = await apiFetch(`/flows/validate/${parentId}`);
    if (validation.errors && validation.errors.length > 0) {
      throw new Error(`发布失败: ${validation.errors.join(', ')}`);
    }

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

  /** 撤下（将已发布流程迁移到草稿） */
  async unpublish(id: string): Promise<void> {
    await apiFetch(`/flows/${id}`, { method: 'DELETE' });
    publishedFlows = publishedFlows.filter(f => f.id !== id);
    writePublished(publishedFlows);
    
    // 清除草稿（撤下操作后清理相关草稿）
    drafts = drafts.filter(d => d.parentId !== id);
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
    // 这也是流程的沙盒环境
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
    // 重新加载草稿数据，确保数据同步
    drafts = readDrafts();
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

  /** 获取单个流程（优先草稿，其次已发布版） */
  getById(id: string): FlowDefinition | undefined {
    // 优先返回草稿数据
    const draft = drafts.find(d => d.data.id === id || d.parentId === id);
    if (draft) {
      console.log('getById() - 返回草稿数据:', id);
      return draft.data;
    }
    
    // 如果没有草稿，返回已发布流程
    const published = publishedFlows.find(f => f.id === id);
    if (published) {
      console.log('getById() - 返回已发布数据:', id);
      return published;
    }
    
    console.log('getById() - 未找到流程:', id);
    return undefined;
  },



  /** 变更流程 ID（类别/名称变更时） */
  retargetId(oldId: string, newId: string): FlowDefinition | undefined {
    // 1. 在已发布版中查找
    const pIdx = publishedFlows.findIndex(f => f.id === oldId);
    if (pIdx >= 0) {
      if (publishedFlows.some(f => f.id === newId)) return undefined; // 新 ID 冲突
      publishedFlows[pIdx] = { ...publishedFlows[pIdx], id: newId, updatedAt: Date.now() };
      writePublished(publishedFlows);
      notify();
      return publishedFlows[pIdx];
    }
    
    // 2. 在草稿中查找
    const draftIdx = drafts.findIndex(d => d.data.id === oldId);
    if (draftIdx >= 0) {
      if (drafts.some(d => d.data.id === newId)) return undefined; // 新 ID 冲突
      const updatedDraft = {
        ...drafts[draftIdx],
        data: { ...drafts[draftIdx].data, id: newId, updatedAt: Date.now() }
      };
      drafts[draftIdx] = updatedDraft;
      writeDrafts(drafts);
      notify();
      return updatedDraft.data;
    }
    
    return undefined;
  },

  /** 更新流程（整体替换） */
  update(id: string, patch: Partial<FlowDefinition>): FlowDefinition | undefined {
    // 验证数据完整性
    if (!id || !patch.name) {
      throw new Error('流程数据不完整');
    }

    // Fork 模式下，更新操作应该保存到草稿
    const flow = this.getById(id);
    if (flow) {
      const updatedFlow = { ...flow, ...patch, updatedAt: Date.now() };
      return this.save(updatedFlow);
    }
    
    return undefined;
  },

  /** 保存流程（Fork 模式下保存到草稿） */
  save(flow: FlowDefinition): FlowDefinition {
    // 验证数据完整性
    if (!flow.id || !flow.name) {
      throw new Error('流程数据不完整');
    }

    // 检查是否有草稿
    const draftIndex = drafts.findIndex(d => d.parentId === flow.id);
    
    if (draftIndex >= 0) {
      // 有草稿，更新草稿
      drafts[draftIndex] = {
        ...drafts[draftIndex],
        data: {
          ...flow,
          publishedVersion: 0, // 草稿的 publishedVersion 必须为 0
        },
        updatedAt: Date.now(),
      };
      writeDrafts(drafts);
      console.log('save() - 更新现有草稿:', flow.id);
    } else {
      // 没有草稿，创建新草稿
      const newDraft: FlowDraft = {
        parentId: flow.id,
        data: {
          ...flow,
          publishedVersion: 0, // 草稿的 publishedVersion 必须为 0
        },
        forkedAt: Date.now(),
        updatedAt: Date.now(),
      };
      drafts.push(newDraft);
      writeDrafts(drafts);
      console.log('save() - 创建新草稿:', flow.id);
    }
    
    notify();
    return flow;
  },

  /** 删除流程 */
  delete(id: string): boolean {
    // 1. 删除已发布版
    publishedFlows = publishedFlows.filter(f => f.id !== id);
    writePublished(publishedFlows);
    
    // 2. 删除相关草稿
    drafts = drafts.filter(d => d.parentId !== id);
    writeDrafts(drafts);
    
    notify();
    return true;
  },

  /** 重命名流程 ID（原子操作：删除旧 key → 以新 key 写回） */
  renameId(oldId: string, newId: string): FlowDefinition | undefined {
    // 1. 在已发布版中查找
    const pIdx = publishedFlows.findIndex(f => f.id === oldId);
    if (pIdx >= 0) {
      if (publishedFlows.some(f => f.id === newId)) return undefined; // 新 ID 冲突
      publishedFlows[pIdx] = { ...publishedFlows[pIdx], id: newId, updatedAt: Date.now() };
      writePublished(publishedFlows);
      notify();
      return publishedFlows[pIdx];
    }
    
    // 2. 在草稿中查找
    const draftIdx = drafts.findIndex(d => d.data.id === oldId);
    if (draftIdx >= 0) {
      if (drafts.some(d => d.data.id === newId)) return undefined; // 新 ID 冲突
      const updatedDraft = {
        ...drafts[draftIdx],
        data: { ...drafts[draftIdx].data, id: newId, updatedAt: Date.now() }
      };
      drafts[draftIdx] = updatedDraft;
      writeDrafts(drafts);
      notify();
      return updatedDraft.data;
    }
    
    return undefined;
  },

  /** 拉取单个正式版覆盖本地 */
  async pullRemote(id: string): Promise<FlowDefinition | undefined> {
    const remote = await apiFetch(`/flows/${id}`);
    
    // 更新已发布版缓存
    const pIdx = publishedFlows.findIndex(f => f.id === id);
    if (pIdx >= 0) {
      publishedFlows[pIdx] = remote;
    } else {
      publishedFlows.push(remote);
    }
    writePublished(publishedFlows);
    
    notify();
    return remote;
  },

  /** 导入（从 JSON 字符串，返回导入后的 flow 或 null） */
  import(json: string): FlowDefinition | null {
    try {
      const flow = JSON.parse(json) as FlowDefinition; // 直接解析，避免循环依赖
      // 若 ID 冲突则重新生成
      if (this.getAll().some(f => f.id === flow.id)) {
        flow.id = 'flow-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      }
      
      // 作为草稿存储，同时也是沙盒环境
      const newDraft: FlowDraft = {
        parentId: flow.id,
        data: {
          ...flow,
          publishedVersion: 0, // 草稿的 publishedVersion 必须为 0
        },
        forkedAt: Date.now(),
        updatedAt: Date.now(),
      };
      drafts.push(newDraft);
      writeDrafts(drafts);
      
      notify();
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