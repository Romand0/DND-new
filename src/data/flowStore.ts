import type { FlowDefinition, FlowPublishStatus } from '../types/flow';
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
// 统一流程缓存：草稿态与已发布态共用一个 localStorage 键，靠 publishedVersion 区分
// （0 / 缺省 = 草稿，> 0 = 已发布）。编辑直接写入此缓存，发布时再同步到后端。
// 旧版本曾拆分为 dnd-flow-published / dnd-flow-drafts 两个键，首次加载时自动迁移合并。
const STORAGE_KEY = 'dnd-flows';              // 统一缓存（草稿 + 已发布）
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

      // 写入统一缓存（upsert）
      return this.save(imported);
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

  /** 拉取远程流程并覆盖本地（用于「拉取正式版」） */
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

  /** 计算三态标签 */
  getPublishStatus(id: string): FlowPublishStatus {
    const flow = flows.find(f => f.id === id);
    if (!flow || !flow.publishedVersion || flow.publishedVersion === 0) {
      return { kind: 'draft' };
    }
    return { kind: 'published', version: flow.publishedVersion };
  },

  /** 获取单个已发布版（只读，战斗引擎用此路径） */
  getPublished(id: string): FlowDefinition | undefined {
    const flow = flows.find(f => f.id === id);
    return flow && flow.publishedVersion && flow.publishedVersion > 0 ? flow : undefined;
  },

  // ──────────── 写入 ────────────

  /** 保存流程（upsert 到统一缓存，不触发后端同步；后端同步由发布完成） */
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

  /** 更新流程（局部合并） */
  update(id: string, patch: Partial<FlowDefinition>): FlowDefinition | undefined {
    if (!id || !patch.name) {
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

  /** 删除流程（仅本地缓存，撤下请用 unpublish） */
  delete(id: string): boolean {
    const next = flows.filter(f => f.id !== id);
    if (next.length === flows.length) return false;
    flows = next;
    writeCache(flows);
    notify();
    return true;
  },

  // ──────────── 新建 ────────────

  /** 创建全新流程（未发布草稿，直接写入统一缓存） */
  async create(name: string = '未命名流程'): Promise<FlowDefinition> {
    const id = 'flow-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const flow: FlowDefinition = {
      id, name, description: '', nodes: [], edges: [],
      tags: [], version: 1,
      createdAt: Date.now(), updatedAt: Date.now(),
    };

    flows.push(flow);
    writeCache(flows);
    notify();
    return flow;
  },

  // ──────────── 发布 ────────────

  /**
   * 发布：验证 → 覆写后端已发布版 → 更新本地统一缓存中的发布信息。
   * 这是编辑内容同步到后端的路径。
   */
  async publish(parentId: string): Promise<FlowDefinition | undefined> {
    const flow = flows.find(f => f.id === parentId);
    if (!flow) return undefined;

    // 验证流程
    const validation = await apiFetch(`/flows/validate/${parentId}`);
    if (validation.errors && validation.errors.length > 0) {
      throw new Error(`发布失败: ${validation.errors.join(', ')}`);
    }

    // 深度清理
    const sanitizedFlow = cleanFlowDefinition(flow);

    // PUT 到 D1：覆写已发布版
    const published = await apiFetch(`/flows/${parentId}`, {
      method: 'PUT',
      body: JSON.stringify(sanitizedFlow),
    });

    const updated: FlowDefinition = {
      ...flow,
      status: 'published',
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt ?? Math.floor(Date.now() / 1000),
      updatedAt: Date.now(),
    };

    const idx = flows.findIndex(f => f.id === parentId);
    if (idx >= 0) flows[idx] = updated;
    else flows.push(updated);
    writeCache(flows);
    notify();
    return updated;
  },

  /** 撤下（从后端移除，本地回退为草稿态） */
  async unpublish(id: string): Promise<void> {
    await apiFetch(`/flows/${id}`, { method: 'DELETE' });

    const idx = flows.findIndex(f => f.id === id);
    if (idx >= 0) {
      flows[idx] = {
        ...flows[idx],
        status: 'draft',
        publishedVersion: 0,
        publishedAt: null,
        updatedAt: Date.now(),
      };
      writeCache(flows);
    }
    notify();
  },

  // ──────────── 远程同步 ────────────

  /**
   * 拉取远程已发布流程并合并进统一缓存。
   * 本地已存在的流程以本地内容为准（可能包含尚未发布的编辑），仅同步发布版本信息。
   */
  async fetchRemote(): Promise<void> {
    const remote = await apiFetch('/flows');
    const remoteList: FlowDefinition[] = Array.isArray(remote) ? remote : [];

    const byId = new Map(flows.map(f => [f.id, f]));
    for (const rf of remoteList) {
      if (!rf?.id) continue;
      const local = byId.get(rf.id);
      if (!local) {
        byId.set(rf.id, { ...rf, publishedVersion: rf.publishedVersion ?? 0 });
      } else {
        const remoteVersion = rf.publishedVersion ?? 0;
        const localVersion = local.publishedVersion ?? 0;
        const version = Math.max(localVersion, remoteVersion);
        byId.set(rf.id, {
          ...local,
          publishedVersion: version,
          publishedAt: rf.publishedAt ?? local.publishedAt,
          status: version > 0 ? 'published' : local.status,
        });
      }
    }

    flows = Array.from(byId.values());
    writeCache(flows);
    notify();
  },

  // ──────────── 兼容性方法（保持向后兼容） ────────────

  /** 判断流程是否处于草稿态（未发布） */
  isDraftDirty(flow: FlowDefinition): boolean {
    return !flow.publishedVersion || flow.publishedVersion === 0;
  },

  /** 变更流程 ID（类别/名称变更时） */
  retargetId(oldId: string, newId: string): FlowDefinition | undefined {
    if (oldId === newId) return flows.find(f => f.id === oldId);
    if (flows.some(f => f.id === newId)) return undefined; // 新 ID 冲突

    const idx = flows.findIndex(f => f.id === oldId);
    if (idx === -1) return undefined;

    flows[idx] = { ...flows[idx], id: newId, updatedAt: Date.now() };
    writeCache(flows);
    notify();
    return flows[idx];
  },

  /** 重命名流程 ID（retargetId 的别名） */
  renameId(oldId: string, newId: string): FlowDefinition | undefined {
    return this.retargetId(oldId, newId);
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
    const sanitizedFlow = cleanFlowDefinition(flow);
    const published = await apiFetch(`/flows/${flow.id}`, {
      method: 'PUT',
      body: JSON.stringify(sanitizedFlow),
    });

    const updated: FlowDefinition = {
      ...flow,
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

  // ──────────── 批量操作 ────────────

  /** 批量创建流程 */
  async batchCreate(input: FlowDefinition[]): Promise<{ success: FlowDefinition[]; failed: { flow: FlowDefinition; reason: string }[] }> {
    const success: FlowDefinition[] = [];
    const failed: { flow: FlowDefinition; reason: string }[] = [];

    for (const flow of input) {
      try {
        const result = await this.create(flow.name);
        success.push(result);
      } catch (err: any) {
        failed.push({ flow, reason: err.message || '创建失败' });
      }
    }

    return { success, failed };
  },

  /** 批量更新流程 */
  async batchUpdate(updates: { id: string; data: Partial<FlowDefinition> }[]): Promise<{ success: FlowDefinition[]; failed: { id: string; reason: string }[] }> {
    const success: FlowDefinition[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const update of updates) {
      try {
        const result = this.update(update.id, update.data);
        if (result) {
          success.push(result);
        } else {
          failed.push({ id: update.id, reason: '流程不存在' });
        }
      } catch (err: any) {
        failed.push({ id: update.id, reason: err.message || '更新失败' });
      }
    }

    return { success, failed };
  },

  /** 批量删除流程 */
  async batchDelete(ids: string[]): Promise<{ success: string[]; failed: { id: string; reason: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const id of ids) {
      try {
        const result = this.delete(id);
        if (result) {
          success.push(id);
        } else {
          failed.push({ id, reason: '流程不存在' });
        }
      } catch (err: any) {
        failed.push({ id, reason: err.message || '删除失败' });
      }
    }

    return { success, failed };
  }

};

export default flowStore;
