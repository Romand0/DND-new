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
    createdAt: flow.createdAt ?? Date.now(),
    updatedAt: flow.updatedAt ?? Date.now(),
  };
  
  // 第二层：处理嵌套结构
  if (cleaned.nodes) {
    cleaned.nodes = cleaned.nodes.map(node => ({
      ...node,
      config: node.config ? deepCleanUndefined(node.config, `nodes.${node.id}.config`) : {},
    }));
  }
  
  if (cleaned.edges) {
    cleaned.edges = cleaned.edges.map(edge => ({
      ...edge,
      config: edge.config ? deepCleanUndefined(edge.config, `edges.${edge.id}.config`) : {},
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
interface ViewportSnapshot {
  scrollX: number;
  scrollY: number;
  scale: number;
  translateX: number;
  translateY: number;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  timestamp: number;
}

// ====== 数据状态 ======
let drafts: FlowDraft[] = [];
let publishedFlows: FlowDefinition[] = [];
let remoteLoaded = false;
let listeners: (() => void)[] = [];

function notify() {
  listeners.forEach(l => l());
}

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

function writeDrafts(d: FlowDraft[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}

function readDrafts(): FlowDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const allDrafts: FlowDraft[] = raw ? JSON.parse(raw) : [];
    
    // 【修复】移除所有依赖数据库的清理逻辑
    // 草稿是独立的，不需要依赖外部数据
    
    // 只做基本去重：按草稿 ID 去重，保留最新版本
    const byId = new Map<string, FlowDraft>();
    allDrafts.forEach(draft => {
      const existing = byId.get(draft.id);
      if (!existing || draft.updatedAt > existing.updatedAt) {
        byId.set(draft.id, draft);
      }
    });
    
    const result = Array.from(byId.values());
    
    // 【修复】移除立即回写逻辑
    // if (result.length < allDrafts.length) {
    //   writeDrafts(result);  // ← 删除这行！
    // }
    
    console.log(`readDrafts() - 返回 ${result.length} 个独立草稿`);
    return result;
  } catch { return []; }
}

// 初始化本地数据
if (typeof window !== 'undefined') {
  // 初始化草稿数据
  drafts = readDrafts();
  publishedFlows = readPublished();
}

const flowStore = {
  /** 订阅数据变化 */
  subscribe(listener: () => void) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  },

  /** 导入流程 */
  import(json: string): FlowDefinition | undefined {
    try {
      const imported = JSON.parse(json);
      if (!imported.id || !imported.name) {
        throw new Error('导入文件格式不正确');
      }
      
      // 验证数据完整性
      const validation = this.validateFlowDefinition(imported);
      if (validation.errors && validation.errors.length > 0) {
        throw new Error(`导入失败: ${validation.errors.join(', ')}`);
      }
      
      // 添加到本地存储
      const flow = this.save(imported);
      notify();
      return flow;
    } catch (error) {
      console.error('导入失败:', error);
      return undefined;
    }
  },

  /** 验证流程定义 */
  validateFlowDefinition(flow: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!flow.id) errors.push('缺少流程 ID');
    if (!flow.name) errors.push('缺少流程名称');
    if (!Array.isArray(flow.nodes)) errors.push('节点列表格式错误');
    if (!Array.isArray(flow.edges)) errors.push('边列表格式错误');
    
    // 验证节点
    flow.nodes?.forEach((node: any, index: number) => {
      if (!node.id) errors.push(`节点 ${index} 缺少 ID`);
      if (!node.type) errors.push(`节点 ${index} 缺少类型`);
      if (!node.position) errors.push(`节点 ${index} 缺少位置`);
    });
    
    // 验证边
    flow.edges?.forEach((edge: any, index: number) => {
      if (!edge.id) errors.push(`边 ${index} 缺少 ID`);
      if (!edge.from) errors.push(`边 ${index} 缺少起始节点`);
      if (!edge.to) errors.push(`边 ${index} 缺少目标节点`);
    });
    
    return { valid: errors.length === 0, errors };
  },

  /** 拉取远程流程 */
  async pullRemote(id: string): Promise<FlowDefinition | undefined> {
    try {
      const response = await apiFetch(`/flows/${id}`);
      if (response) {
        const flow = response as FlowDefinition;
        
        // 更新本地已发布版缓存
        const pIdx = publishedFlows.findIndex(f => f.id === id);
        if (pIdx >= 0) {
          publishedFlows[pIdx] = flow;
        } else {
          publishedFlows.push(flow);
        }
        writePublished(publishedFlows);
        
        notify();
        return flow;
      }
      return undefined;
    } catch (error) {
      console.error('拉取远程流程失败:', error);
      return undefined;
    }
  },

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
    return drafts.find(d => d.data.id === parentId);
  },

  /** 计算三态标签 */
  getPublishStatus(id: string): FlowPublishStatus {
    const flow = publishedFlows.find(f => f.id === id)
      || drafts.find(d => d.data.id === id)?.data;
    if (!flow) return { kind: 'draft' };
    return computePublishStatus(flow, drafts.find(d => d.data.id === id));
  },

  // ──────────── 草稿操作 ────────────

  /**
   * 进入沙盒环境：确保流程有沙盒环境
   * - 如果流程从未发布过，沙盒就是草稿本身
   * - 如果流程已发布，沙盒基于最新发布态创建
   * - 沙盒环境长期存在，清空后可以重新进入
   */
  enterSandbox(parentId: string): FlowDefinition {
    const existing = drafts.find(d => d.data.id === parentId);
    if (existing) return existing.data;  // 沙盒已存在，直接返回

    const published = publishedFlows.find(f => f.id === parentId);
    if (!published) {
      throw new Error(`流程 ${parentId} 不存在，无法进入沙盒`);
    }

    // 创建沙盒环境（基于最新发布态）
    const sandbox: FlowDraft = {
      id: `draft-${parentId}-${Date.now()}`,
      data: { ...published, updatedAt: Date.now() },
      dataVersion: published.version || 1,
      draftVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSynced: false,
      metadata: {
        source: 'local',
        syncAttempts: 0,
      },
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
      id: `draft-${parentId}-${Date.now()}`,
      data: { ...published, updatedAt: Date.now() },
      dataVersion: published.version || 1,
      draftVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSynced: false,
      metadata: {
        source: 'local',
        syncAttempts: 0,
      },
    };
    drafts.push(sandbox);
    writeDrafts(drafts);
    notify();
    return sandbox.data;
  },

  /** 保存草稿（编辑器每次改动调用） */
  saveDraft(parentId: string, patch: Partial<FlowDefinition>): FlowDraft | undefined {
    const idx = drafts.findIndex(d => d.data.id === parentId);
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
    const next = drafts.filter(d => d.data.id !== parentId);
    if (next.length === drafts.length) return false;
    drafts = next;
    writeDrafts(drafts);
    notify();
    return true;
  },

  /** 清空草稿（编辑器主动清空） */
  clearDraft(parentId: string): boolean {
    const next = drafts.filter(d => d.data.id !== parentId);
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
      id: `draft-${parentId}-${Date.now()}`,
      data: { ...published, updatedAt: Date.now() },
      dataVersion: published.version || 1,
      draftVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSynced: false,
      metadata: {
        source: 'local',
        syncAttempts: 0,
      },
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
    const draft = drafts.find(d => d.data.id === parentId);
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
    drafts = drafts.filter(d => d.data.id !== parentId);
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
    drafts = drafts.filter(d => d.data.id !== id);
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
    
    // 再作为草稿存储到localStorage，id 等于自身 id
    // 这也是流程的沙盒环境
    const draft: FlowDraft = {
      id: `draft-${id}-${Date.now()}`,
      data: flow,
      dataVersion: 1,
      draftVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSynced: false,
      metadata: {
        source: 'local',
        syncAttempts: 0,
      },
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
          d.data.id === flow.id
        );
        if (!localDraft || localDraft.updatedAt < flow.updatedAt) {
          remoteDrafts.push({
            id: `draft-${flow.id}-${Date.now()}`,
            data: { ...flow, publishedVersion: 0 },
            dataVersion: flow.version || 1,
            draftVersion: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isSynced: true,
            metadata: {
              source: 'remote',
              syncAttempts: 0,
            },
          });
        }
      }
    }
    
    publishedFlows = remotePublished;  // 只含真正的已发布版
    writePublished(publishedFlows);
    
    // 合并远程草稿到本地（本地优先）
    const localDraftIds = new Set(drafts.map(d => d.data.id));
    for (const rd of remoteDrafts) {
      if (!localDraftIds.has(rd.data.id)) {
        drafts.push(rd);
      }
    }
    writeDrafts(drafts);
    
    notify();
  },

  // ──────────── Diff ────────────

  /** 计算草稿相对已发布版的变更（Fork 模式天然支持） */
  diff(parentId: string): { addedNodes: string[]; removedNodes: string[]; modifiedNodes: string[] } | null {
    const draft = drafts.find(d => d.data.id === parentId);
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
    const draft = drafts.find(d => d.data.id === flow.id);
    return draft ? (draft.updatedAt > (flow.publishedAt ?? 0)) : false;
  },

  /** 获取单个流程（优先草稿，其次已发布版） */
  getById(id: string): FlowDefinition | undefined {
    // 查找该流程的所有草稿版本
    const relevantDrafts = drafts.filter(d => d.data.id === id);
    
    if (relevantDrafts.length > 0) {
      // 返回最新版本的草稿数据
      const latestDraft = relevantDrafts.reduce((latest, current) => 
        current.dataVersion > latest.dataVersion ? current : latest
      );
      console.log('getById() - 返回最新草稿数据:', id, '版本:', latestDraft.dataVersion);
      return latestDraft.data;
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
      // 冲突检测：检查 data.id
      if (drafts.some(d => d.data.id === newId)) return undefined;
      const updatedDraft = {
        ...drafts[draftIdx],
        id: `draft-${newId}-${Date.now()}`,
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

    // 获取该流程的所有草稿版本
    const relevantDrafts = drafts.filter(d => d.data.id === flow.id);
    
    if (relevantDrafts.length > 0) {
      // 找到最新版本的草稿
      const latestDraft = relevantDrafts.reduce((latest, current) => 
        current.dataVersion > latest.dataVersion ? current : latest
      );
      
      // 检查是否真的需要更新
      if (latestDraft.dataVersion >= flow.version) {
        console.log('save() - 草稿已是最新，无需更新:', flow.id);
        return flow;
      }
      
      // 更新现有草稿，保持草稿 ID 不变
      const draftIndex = drafts.findIndex(d => d.id === latestDraft.id);
      drafts[draftIndex] = {
        ...latestDraft,
        data: flow,
        dataVersion: flow.version,
        updatedAt: Date.now(),
        isSynced: false,
      };
      writeDrafts(drafts);
      console.log('save() - 更新现有草稿:', flow.id);
    } else {
      // 创建新草稿
      const newDraft: FlowDraft = {
        id: `draft-${flow.id}-${flow.version}-${Date.now()}`,
        data: flow,
        dataVersion: flow.version,
        draftVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isSynced: false,
        metadata: {
          source: 'local',
          syncAttempts: 0,
        },
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
    drafts = drafts.filter(d => d.data.id !== id);
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
      // 冲突检测：检查 data.id
      if (drafts.some(d => d.data.id === newId)) return undefined;
      const updatedDraft = {
        ...drafts[draftIdx],
        id: `draft-${newId}-${Date.now()}`,
        data: { ...drafts[draftIdx].data, id: newId, updatedAt: Date.now() }
      };
      drafts[draftIdx] = updatedDraft;
      writeDrafts(drafts);
      notify();
      return updatedDraft.data;
    }
    
    return undefined;
  },

  // ──────────── 视图快照 ────────────

  /** 保存编辑器视图快照 */
  saveViewportSnapshot(flowId: string, snapshot: ViewportSnapshot): void {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY);
      const snapshots: Record<string, ViewportSnapshot> = raw ? JSON.parse(raw) : {};
      
      // 合并现有快照和新快照
      snapshots[flowId] = {
        ...snapshots[flowId],
        ...snapshot,
        timestamp: Date.now(),
      };
      
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(snapshots));
    } catch { /* ignore */ }
  },

  /** 获取编辑器视图快照 */
  getViewportSnapshot(flowId: string): ViewportSnapshot | null {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY);
      const snapshots: Record<string, ViewportSnapshot> = raw ? JSON.parse(raw) : {};
      return snapshots[flowId] || null;
    } catch { return null; }
  },

};

// ====== 发布模式 ======
export default flowStore;