import type { FlowDefinition, FlowDraft, FlowPublishStatus } from '../types/flow';
import { computePublishStatus } from '../types/flow';
import { apiFetch } from '../lib/api';
import { useState, useEffect } from 'react';

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
    const allDrafts: FlowDraft[] = raw ? JSON.parse(raw) : [];
    
    // 第一轮：按 parentId 去重，保留最新
    const byParentId = new Map<string, FlowDraft>();
    allDrafts.forEach(draft => {
      const existing = byParentId.get(draft.parentId);
      if (!existing || draft.updatedAt > existing.updatedAt) {
        byParentId.set(draft.parentId, draft);
      }
    });
    
    // 第二轮：按 data.id 去重，保留最新（消除同 ID 多 parentId 的幽灵）
    const byDataId = new Map<string, FlowDraft>();
    for (const draft of byParentId.values()) {
      // 自修正：parentId 与 data.id 不一致时，以 data.id 为准
      const canonical = draft.parentId !== draft.data.id && !publishedFlows.some(f => f.id === draft.parentId)
        ? { ...draft, parentId: draft.data.id }
        : draft;
      
      const existing = byDataId.get(canonical.data.id);
      if (!existing || canonical.updatedAt > existing.updatedAt) {
        byDataId.set(canonical.data.id, canonical);
      }
    }
    
    // 第三轮：清除孤儿草稿（parentId 既不在已发布版中，也不在其他草稿的 data.id 中）
    // 仅保留：parentId 在 publishedFlows 中，或 data.id 等于 parentId（纯草稿流程）
    const validDrafts = Array.from(byDataId.values()).filter(draft => {
      const isPublished = publishedFlows.some(f => f.id === draft.parentId);
      const isPureDraft = draft.parentId === draft.data.id;
      return isPublished || isPureDraft;
    });
    
    // 标准化：publishedVersion 归零
    const result = validDrafts.map(draft => ({
      ...draft,
      data: { ...draft.data, publishedVersion: 0 },
    }));
    
    // 如果清理有成效，立即回写（一次性修复）
    if (result.length < allDrafts.length) {
      console.log(`readDrafts() - 清理幽灵草稿: ${allDrafts.length} → ${result.length}`);
      writeDrafts(result);
    }
    
    return result;
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
  async create(name: string = '未命名流程'): Promise<FlowDefinition> {
    const id = 'flow-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const flow: FlowDefinition = {
      id, name, description: '', nodes: [], edges: [],
      tags: [], version: 1,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    
    // 先同步到数据库，确保有ID
    try {
      await apiFetch('/flows', {
        method: 'POST',
        body: JSON.stringify(flow),
      });
      console.log('create() - 流程已同步到数据库:', id);
    } catch (error) {
      console.warn('create() - 数据库同步失败，仅保存到本地:', error);
    }
    
    // 再作为草稿存储到localStorage，parentId 等于自身 id
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
    remoteLoaded = true;
    
    // 正确分离：已发布版 vs 远程草稿
    const remotePublished: FlowDefinition[] = [];
    const remoteDrafts: FlowDraft[] = [];
    
    for (const flow of flows) {
      if (flow.publishedVersion && flow.publishedVersion > 0) {
        remotePublished.push(flow);
      } else {
        // 远程草稿：仅当本地没有更新版本时才采纳
        const localDraft = drafts.find(d => 
          d.parentId === flow.id || d.data.id === flow.id
        );
        if (!localDraft || localDraft.updatedAt < flow.updatedAt) {
          remoteDrafts.push({
            parentId: flow.id,
            data: { ...flow, publishedVersion: 0 },
            forkedAt: flow.createdAt ?? Date.now(),
            updatedAt: flow.updatedAt ?? Date.now(),
          });
        }
      }
    }
    
    publishedFlows = remotePublished;  // 只含真正的已发布版
    writePublished(publishedFlows);
    
    // 合并远程草稿到本地（本地优先）
    const localDraftIds = new Set(drafts.map(d => d.parentId));
    for (const rd of remoteDrafts) {
      if (!localDraftIds.has(rd.parentId)) {
        drafts.push(rd);
      }
    }
    writeDrafts(drafts);
    
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
    const draftIdx = drafts.findIndex(d => d.parentId === oldId || d.data.id === oldId);
    if (draftIdx >= 0) {
      // 冲突检测：同时检查 parentId 和 data.id
      if (drafts.some(d => d.parentId === newId || d.data.id === newId)) return undefined;
      const updatedDraft = {
        ...drafts[draftIdx],
        parentId: newId,  // ← 关键修复：同步更新 parentId
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
    
    // 如果草稿已存在且版本相同，则不重复保存
    if (draftIndex >= 0 && drafts[draftIndex].data.updatedAt === flow.updatedAt) {
      console.log('save() - 草稿版本相同，跳过保存:', flow.id);
      return flow;
    }
    
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
    const draftIdx = drafts.findIndex(d => d.parentId === oldId || d.data.id === oldId);
    if (draftIdx >= 0) {
      // 冲突检测：同时检查 parentId 和 data.id
      if (drafts.some(d => d.parentId === newId || d.data.id === newId)) return undefined;
      const updatedDraft = {
        ...drafts[draftIdx],
        parentId: newId,  // ← 关键修复：同步更新 parentId
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

// ====== 实时同步Hook ======
export function useRealtimeSync(flowId: string) {
  const [flow, setFlow] = useState<FlowDefinition>();
  
  useEffect(() => {
    if (flow && flowId) {
      // 实时同步到草稿
      flowStore.saveDraft(flowId, flow);
    }
  }, [flow, flowId]);
  
  return { flow, setFlow };
}

// ====== 沙盒环境持久化Hook ======
export function useSandboxPersistence(flowId: string) {
  const [flow, setFlow] = useState<FlowDefinition>();
  
  // 进入沙盒环境
  useEffect(() => {
    if (flowId) {
      const sandboxData = flowStore.enterSandbox(flowId);
      setFlow(sandboxData);
    }
  }, [flowId]);
  
  // 页面卸载时保存
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (flow && flowId) {
        flowStore.saveDraft(flowId, flow);
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // 组件卸载时保存
      if (flow && flowId) {
        flowStore.saveDraft(flowId, flow);
      }
    };
  }, [flow, flowId]);
  
  // 定期自动保存
  useEffect(() => {
    if (!flow || !flowId) return;
    
    const interval = setInterval(() => {
      flowStore.saveDraft(flowId, flow);
    }, 30000); // 每30秒自动保存一次
    
    return () => clearInterval(interval);
  }, [flow, flowId]);
  
  return { flow, setFlow };
}

export default flowStore;