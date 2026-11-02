// 团组制品云同步：六类纯本地数据（combat/treasure/note/battleground/calendar/gametime）的
// 通用「本地优先 + 云端异步备份」通道。写路径失败重试（有限次），读路径惰性首拉一次、
// 失败可重试；列表型条目拉取后用 mergeByIdentity 按 updatedAt 合并，防止云端旧快照回退本地新写入。
import { fetchArtifacts, putArtifact, deleteArtifact, hasToken } from '@/lib/api';

// 防抖间隔：连续保存（拖拽/批量编辑）合并为一次上传
const FLUSH_DELAY_MS = 1500;

// 上云失败重试上限：超过后放弃该条并告警（数据保留在本地，避免 401/断网时无限请求风暴）
const MAX_FLUSH_RETRIES = 5;

type PendingOp = { kind: 'put' | 'delete'; payload: unknown };
const pending = new Map<string, PendingOp>();
const retryCounts = new Map<string, number>();
let flushTimer: number | null = null;

function opKey(artifactKind: string, id: string) {
  return `${artifactKind}:${id}`;
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

/**
 * 冲刷待上传队列。final=true 时用 fetch keepalive（页面卸载场景，浏览器尽力放行完成；
 * 超过 64KB 的请求体会被浏览器拒绝，与不发持平）。
 */
export async function flush(final = false): Promise<void> {
  if (pending.size === 0) return;
  const ops = Array.from(pending.entries());
  pending.clear();
  const failed: [string, PendingOp][] = [];
  for (const [key, op] of ops) {
    const sep = key.indexOf(':');
    const artifactKind = key.slice(0, sep);
    const id = key.slice(sep + 1);
    const fetchOpts = final ? { keepalive: true } : undefined;
    try {
      if (op.kind === 'put') {
        await putArtifact(artifactKind, id, op.payload, fetchOpts);
      } else {
        await deleteArtifact(artifactKind, id, fetchOpts);
      }
      retryCounts.delete(key);
    } catch {
      const count = (retryCounts.get(key) ?? 0) + 1;
      retryCounts.set(key, count);
      if (count >= MAX_FLUSH_RETRIES) {
        retryCounts.delete(key);
        console.warn(`[artifactSync] ${key} 连续 ${MAX_FLUSH_RETRIES} 次上云失败，已放弃（本地数据不受影响）`);
      } else {
        failed.push([key, op]);
      }
    }
  }
  if (failed.length) {
    for (const [key, op] of failed) if (!pending.has(key)) pending.set(key, op);
    scheduleFlush();
  }
}

/** 队列一条制品上传（data 为整包 JSON，含 id） */
export function queueArtifactPut(artifactKind: string, id: string, data: unknown) {
  if (!hasToken()) return;
  pending.set(opKey(artifactKind, id), { kind: 'put', payload: data });
  scheduleFlush();
}

/** 队列一条制品删除 */
export function queueArtifactDelete(artifactKind: string, id: string) {
  if (!hasToken()) return;
  pending.set(opKey(artifactKind, id), { kind: 'delete', payload: '' });
  scheduleFlush();
}

/**
 * diff 两个列表版本并排队同步（列表型 store 的 save() 调用）：
 * - 引用不等或 id 新增的条目 → PUT
 * - 旧有新无的 id → DELETE
 * 列表型 store 的条目每次编辑都会重建对象（引用不等），引用比较即可覆盖增改。
 */
export function syncListDiff<T>(artifactKind: string, oldList: T[] | null, newList: T[], getId: (item: T) => string) {
  const oldMap = new Map((oldList ?? []).map(i => [getId(i), i]));
  const newMap = new Map(newList.map(i => [getId(i), i]));
  for (const item of newList) {
    const id = getId(item);
    const prev = oldMap.get(id);
    if (prev !== item) queueArtifactPut(artifactKind, id, item);
  }
  for (const id of oldMap.keys()) {
    if (!newMap.has(id)) queueArtifactDelete(artifactKind, id);
  }
}

/**
 * 惰性首拉：每个 (kind, store) 组合只拉一次云端，把云端列表交给 onReplace 回调。
 * 返回 null 表示未登录/拉取失败（调用方保持本地数据）。
 * 拉取失败（401/断网）不锁定 pulled——下次 loadAll 会重试，避免设备整场会话与云端隔绝。
 *
 * 列表型条目推荐在 onReplace 里用 mergeByIdentity 合并而非整体替换：
 * 整体替换会把「本地刚写入尚未上云」的条目用云端旧快照抹掉（刷新后棋子/战斗记录回退的根因）。
 */
const pulled = new Set<string>();

export async function pullArtifactsOnce<T = any[]>(
  artifactKind: string,
  onReplace: (list: T) => void
): Promise<T | null> {
  if (pulled.has(artifactKind) || !hasToken()) return null;
  pulled.add(artifactKind);
  // 首拉前先把待上传队列冲出去：避免「本会话刚写入尚未上云」时拉到云端旧快照
  await flush();
  try {
    const list = await fetchArtifacts<T>(artifactKind);
    // 云端空列表不覆盖本地：本地优先架构下「云端无数据」意味着从未成功上传，
    // 用它替换会抹掉本地已有内容（防抖丢失/上传失败时尤其致命）；
    // 「在所有设备上删空」的同步以下次写入自然收敛
    if (Array.isArray(list) && list.length > 0) onReplace(list);
    return list;
  } catch {
    // 拉取失败解锁：下次 loadAll 重新尝试首拉
    pulled.delete(artifactKind);
    return null;
  }
}

/**
 * 按业务 id 合并本地与云端列表：updatedAt 新者胜，双方独有条目都保留。
 * - 本地刚写入尚未上云（updatedAt 较新）→ 本地胜，云端旧快照无法回退
 * - 其他设备更新的条目（云端 updatedAt 较新）→ 云端胜，跨设备同步照常生效
 * 设备间时钟偏差可能导致个别条目误判新旧，属可接受代价（同一用户的多设备场景）。
 */
export function mergeByIdentity<T>(
  local: T[],
  cloud: T[],
  getId: (item: T) => string,
  getUpdatedAt: (item: T) => number | undefined
): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(getId(item), item);
  for (const item of cloud) {
    const id = getId(item);
    const prev = map.get(id);
    if (!prev || (getUpdatedAt(item) ?? 0) > (getUpdatedAt(prev) ?? 0)) map.set(id, item);
  }
  return [...map.values()];
}

/** 团组单例制品（calendar/gametime）直接上传，id 固定 singleton */
export function queueSingletonPut(artifactKind: string, data: unknown) {
  queueArtifactPut(artifactKind, 'singleton', data);
}

// 页面卸载时若防抖窗口未到，定时器会连同队列一起销毁（写入丢失的主因）。
// 卸载钩子里用 keepalive 冲刷一次：请求在页面关闭后仍能继续完成
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
      void flush(true);
    }
  });
}
