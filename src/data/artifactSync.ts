// 团组制品云同步：六类纯本地数据（combat/treasure/note/battleground/calendar/gametime）的
// 通用「本地优先 + 云端异步备份」通道。写路径 fire-and-forget（失败静默），读路径惰性首拉一次。
import { fetchArtifacts, putArtifact, deleteArtifact, hasToken } from '@/lib/api';

// 防抖间隔：连续保存（拖拽/批量编辑）合并为一次上传
const FLUSH_DELAY_MS = 1500;

type PendingOp = { kind: 'put' | 'delete'; payload: unknown };
const pending = new Map<string, PendingOp>();
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

async function flush() {
  if (pending.size === 0) return;
  const ops = Array.from(pending.entries());
  pending.clear();
  for (const [key, op] of ops) {
    const sep = key.indexOf(':');
    const artifactKind = key.slice(0, sep);
    const id = key.slice(sep + 1);
    try {
      if (op.kind === 'put') {
        await putArtifact(artifactKind, id, op.payload);
      } else {
        await deleteArtifact(artifactKind, id);
      }
    } catch {
      // 断网/未授权静默：本地数据为权威，云端下次写入自然覆盖
    }
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
 * 惰性首拉：每个 (kind, store) 组合只拉一次云端并替换本地。
 * 返回 null 表示未登录/拉取失败（调用方保持本地数据）。
 */
const pulled = new Set<string>();

export async function pullArtifactsOnce<T = any[]>(
  artifactKind: string,
  onReplace: (list: T) => void
): Promise<T | null> {
  if (pulled.has(artifactKind) || !hasToken()) return null;
  pulled.add(artifactKind);
  try {
    const list = await fetchArtifacts<T>(artifactKind);
    if (Array.isArray(list)) onReplace(list);
    return list;
  } catch {
    return null;
  }
}

/** 团组单例制品（calendar/gametime）直接上传，id 固定 singleton */
export function queueSingletonPut(artifactKind: string, data: unknown) {
  queueArtifactPut(artifactKind, 'singleton', data);
}
