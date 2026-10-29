import type { FlowDefinition } from '../types/flow';
import { parseFlowId } from '../types/flow';
import { apiFetch } from '../lib/api';
import { validateForPublish } from '../utils/flow-editor/validation';
import { createBlankFlow } from './flowFactory';

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
// 本地缓存是「云端正式版的只读镜像」：编辑器不再把未保存内容写入这里。
// 编辑态只存在于 FlowEditor 组件内存中，退出即丢弃；保存即发布到云端。
// 旧版本曾把草稿写入同一键，首次加载时仍会做一次迁移合并（migrateLegacy）。
const STORAGE_KEY = 'dnd-flows';              // 正式版镜像缓存
const LEGACY_PUBLISHED_KEY = 'dnd-flow-published';
const LEGACY_DRAFTS_KEY = 'dnd-flow-drafts';
const VIEWPORT_KEY = 'dnd-flow-viewport-snapshots';

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
let flows: FlowDefinition[] = [];
let listeners: (() => void)[] = [];

function notify() {
  listeners.forEach(l => l());
}

function writeCache(list: FlowDefinition[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

/**
 * 从旧的双键存储（已发布缓存 + 草稿缓存）迁移到统一缓存。
 * 已发布流程保留其版本号，若同一流程存在草稿则以草稿内容为准。
 */
function migrateLegacy(): FlowDefinition[] {
  const merged = new Map<string, FlowDefinition>();

  try {
    const raw = localStorage.getItem(LEGACY_PUBLISHED_KEY);
    const published: FlowDefinition[] = raw ? JSON.parse(raw) : [];
    published.forEach(f => {
      if (f?.id) merged.set(f.id, f);
    });
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(LEGACY_DRAFTS_KEY);
    const drafts: any[] = raw ? JSON.parse(raw) : [];
    drafts.forEach(d => {
      const data: FlowDefinition | undefined = d?.data ?? d;
      if (!data?.id) return;
      const prev = merged.get(data.id);
      // 已发布流程被再次编辑时，保留发布版本号，采用草稿内容
      merged.set(data.id, {
        ...(prev ?? {}),
        ...data,
        publishedVersion: prev?.publishedVersion ?? 0,
      });
    });
  } catch { /* ignore */ }

  return Array.from(merged.values());
}

function readCache(): FlowDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const migrated = migrateLegacy();
  if (migrated.length > 0) writeCache(migrated);
  return migrated;
}

// 初始化本地数据
if (typeof window !== 'undefined') {
  flows = readCache();
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

  /** 导入流程（写入云端正式版，成功后镜像同步） */
  async import(json: string): Promise<FlowDefinition | undefined> {
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

      return await this.publish(imported as FlowDefinition);
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

  /**
   * 拉取远程正式版并写入本地镜像（用于「拉取正式版」与战斗引擎按需取用）。
   * 云端是唯一真相，因此这里直接以远程内容覆盖镜像。
   */
  async pullRemote(id: string): Promise<FlowDefinition | undefined> {
    try {
      const response = await apiFetch(`/flows/${id}`);
      if (!response) return undefined;
      const flow = response as FlowDefinition;
      return this.save(flow);
    } catch (error) {
      console.error('拉取远程流程失败:', error);
      return undefined;
    }
  },

  // ──────────── 读取 ────────────

  /** 获取所有流程（草稿 + 已发布，保持插入顺序） */
  getAll(): FlowDefinition[] {
    return [...flows];
  },

  /** 获取单个流程 */
  getById(id: string): FlowDefinition | undefined {
    return flows.find(f => f.id === id);
  },

  /** 获取单个已发布版（只读，战斗引擎用此路径） */
  getPublished(id: string): FlowDefinition | undefined {
    const flow = flows.find(f => f.id === id);
    return flow && flow.publishedVersion && flow.publishedVersion > 0 ? flow : undefined;
  },

  // ──────────── 写入 ────────────

  /**
   * 写入本地镜像（不触发云端同步）。
   * 仅供拉取正式版 / 远程合并 / 导入后落镜像使用；编辑器不再走这里保存草稿。
   */
  save(flow: FlowDefinition): FlowDefinition {
    if (!flow.id || !flow.name) {
      throw new Error('流程数据不完整');
    }

    const idx = flows.findIndex(f => f.id === flow.id);
    if (idx >= 0) {
      flows[idx] = flow;
    } else {
      flows.push(flow);
    }
    writeCache(flows);
    notify();
    return flow;
  },

  /** 更新流程（局部合并；patch 只需携带要改的字段，如绑定计数） */
  update(id: string, patch: Partial<FlowDefinition>): FlowDefinition | undefined {
    if (!id) {
      throw new Error('流程数据不完整');
    }

    const idx = flows.findIndex(f => f.id === id);
    if (idx === -1) return undefined;

    const updated = { ...flows[idx], ...patch, updatedAt: Date.now() };
    flows[idx] = updated;
    writeCache(flows);
    notify();
    return updated;
  },

  /** 仅移除本地镜像（不触碰云端；需要删云端请用 remove） */
  delete(id: string): boolean {
    const next = flows.filter(f => f.id !== id);
    if (next.length === flows.length) return false;
    flows = next;
    writeCache(flows);
    notify();
    return true;
  },

  // ──────────── 新建 ────────────

  /** 生成空白流程（纯内存对象，不写任何持久层）；发布后才会出现在列表里 */
  create(name: string = '未命名流程'): FlowDefinition {
    return createBlankFlow(name);
  },

  // ──────────── 发布 ────────────

  /**
   * 发布：本地校验 → 覆写云端正式版 → 同步本地镜像。
   * 编辑器不再先写本地草稿，直接把内存中的流程传进来；发布成功即成为唯一真相。
   */
  async publish(flow: FlowDefinition): Promise<FlowDefinition> {
    if (!flow?.id) throw new Error('流程数据不完整');

    const validation = validateForPublish(flow);
    if (!validation.valid) {
      const detail = 'details' in validation && validation.details
        ? validation.details.map(d => d.message).join('; ')
        : (validation as { error?: string }).error || '流程校验未通过';
      throw new Error(`发布失败: ${detail}`);
    }

    // 类别以 ID 前缀为准：避免 category 与 id 漂移导致后端按旧类别入库
    const withCategory: FlowDefinition = {
      ...flow,
      category: parseFlowId(flow.id).category,
      status: 'published',
    };

    // 深度清理
    const sanitizedFlow = cleanFlowDefinition(withCategory);

    // PUT 到 D1：覆写已发布版
    const published = await apiFetch(`/flows/${flow.id}`, {
      method: 'PUT',
      body: JSON.stringify(sanitizedFlow),
    });

    const updated: FlowDefinition = {
      ...withCategory,
      status: 'published',
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt ?? Math.floor(Date.now() / 1000),
      updatedAt: Date.now(),
    };

    const idx = flows.findIndex(f => f.id === flow.id);
    if (idx >= 0) flows[idx] = updated;
    else flows.push(updated);
    writeCache(flows);
    notify();
    return updated;
  },

  /** 撤下：云端正式版移入草稿表，本地镜像随之移除 */
  async unpublish(id: string): Promise<void> {
    await apiFetch(`/flows/${id}`, { method: 'DELETE' });

    const next = flows.filter(f => f.id !== id);
    if (next.length !== flows.length) {
      flows = next;
      writeCache(flows);
    }
    notify();
  },

  /**
   * 删除：从云端彻底删除（不留下草稿行），并移除本地镜像。
   * 云端不存在时按已删除处理，避免幽灵记录卡在镜像里。
   */
  async remove(id: string): Promise<void> {
    try {
      await apiFetch(`/flows/${id}?purge=1`, { method: 'DELETE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('流程不存在')) throw error;
    }

    const next = flows.filter(f => f.id !== id);
    if (next.length !== flows.length) {
      flows = next;
      writeCache(flows);
    }
    notify();
  },

  // ──────────── 远程同步 ────────────

  /**
   * 拉取云端正式版覆盖本地镜像。
   *
   * 镜像是只读副本，云端才是唯一真相：远程存在的流程整条以远程内容替换，
   * 云端已删除/撤下的流程从镜像里移除。唯一保留的是「从未发布过的遗留本地流程」
   * （publishedVersion 为 0 且云端无同名记录），它们还没有云端身份，删掉就找不回了。
   */
  async fetchRemote(): Promise<void> {
    const remote = await apiFetch('/flows');
    const remoteList: FlowDefinition[] = Array.isArray(remote) ? remote : [];

    const merged = new Map<string, FlowDefinition>();
    for (const rf of remoteList) {
      if (!rf?.id) continue;
      merged.set(rf.id, { ...rf, publishedVersion: rf.publishedVersion ?? 0 });
    }

    for (const local of flows) {
      const version = local.publishedVersion ?? 0;
      if (version === 0 && !merged.has(local.id)) merged.set(local.id, local);
    }

    flows = Array.from(merged.values());
    writeCache(flows);
    notify();
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

  // ──────────── 控制台直写发布态 ────────────

  /** 获取所有已发布版流程（控制台按名称查找用） */
  getAllPublished(): FlowDefinition[] {
    return flows.filter(f => !!f.publishedVersion && f.publishedVersion > 0);
  },

  /** 按名称查找已发布版流程 */
  getPublishedByName(name: string): FlowDefinition | undefined {
    return flows.find(f => f.name === name && !!f.publishedVersion && f.publishedVersion > 0);
  },

  /**
   * 直接发布（控制台专用）：不走编辑器保存流程，直接写入发布态。
   * 接收一份完整 FlowDefinition 并覆写 D1，同时更新本地统一缓存。
   */
  async publishDirect(flow: FlowDefinition): Promise<FlowDefinition> {
    const withCategory: FlowDefinition = {
      ...flow,
      category: parseFlowId(flow.id).category,
      status: 'published',
    };
    const sanitizedFlow = cleanFlowDefinition(withCategory);
    const published = await apiFetch(`/flows/${flow.id}`, {
      method: 'PUT',
      body: JSON.stringify(sanitizedFlow),
    });

    const updated: FlowDefinition = {
      ...withCategory,
      status: 'published',
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt ?? Math.floor(Date.now() / 1000),
      updatedAt: Date.now(),
    };

    const idx = flows.findIndex(f => f.id === flow.id);
    if (idx >= 0) flows[idx] = updated;
    else flows.push(updated);
    writeCache(flows);
    notify();
    return updated;
  },


};

export default flowStore;
