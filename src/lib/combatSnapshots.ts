/**
 * 战斗回合快照的 IndexedDB 持久化层（对应 D1：Browser IndexedDB）。
 *
 * 为什么不用 localStorage：
 *   1. localStorage 通常 <5MB，单条战斗记录 30+ 回合 × 20 参战者很快超限；
 *   2. localStorage 是同步 IO，大对象读写会阻塞主线程；
 *   3. 关闭/刷新页面后 useRef 内存快照立刻丢失，IndexedDB 保证可恢复。
 *
 * Schema（version 1）：
 *   store: `combat_snapshots`
 *     keyPath: `key`   // string:  `${sessionId}:${round}:${combatantId}`  —  回合快照
 *                       // or:    `${sessionId}:__initial__`             —  进入放映模式时的初始快照
 *     indexes: none（按 key 精确读 + sessionId 前缀扫描）
 *     value: { key: string; sessionId: string; kind: 'initial'|'turn'; round?: number;
 *              combatantId?: string; snapshot: TurnSnapshot; createdAt: number; }
 */

import type { Combatant, TurnSnapshot } from '@/types/combat';

const DB_NAME = 'dnd-tool';
const DB_VERSION = 1;
const STORE = 'combat_snapshots';

interface Row {
  key: string;
  sessionId: string;
  kind: 'initial' | 'turn';
  round?: number;
  combatantId?: string;
  snapshot: TurnSnapshot;
  createdAt: number;
}

let _db: IDBDatabase | null = null;
let _opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;
  _opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _opening = null;
      resolve(_db);
    };
    req.onerror = () => {
      _opening = null;
      reject(req.error);
    };
  });
  return _opening;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> {
  return openDb().then(db => new Promise<T | undefined>((resolve, reject) => {
    const tr = db.transaction(STORE, mode);
    const store = tr.objectStore(STORE);
    let req: IDBRequest<T> | undefined;
    try { req = fn(store) as IDBRequest<T> | undefined; } catch (e) { reject(e); return; }
    tr.oncomplete = () => resolve(req?.result as T | undefined);
    tr.onerror = () => reject(tr.error);
    tr.onabort = () => reject(tr.error);
  }));
}

export function turnKey(sessionId: string, round: number, combatantId: string) {
  return `${sessionId}:${round}:${combatantId}`;
}
export function initialKey(sessionId: string) {
  return `${sessionId}:__initial__`;
}

export async function putInitialSnapshot(sessionId: string, snapshot: TurnSnapshot): Promise<void> {
  const row: Row = {
    key: initialKey(sessionId), sessionId, kind: 'initial',
    snapshot, createdAt: Date.now(),
  };
  await tx('readwrite', s => s.put(row));
}

export async function putTurnSnapshot(sessionId: string, round: number, combatantId: string, snapshot: TurnSnapshot): Promise<void> {
  const row: Row = {
    key: turnKey(sessionId, round, combatantId), sessionId, kind: 'turn',
    round, combatantId, snapshot, createdAt: Date.now(),
  };
  await tx('readwrite', s => s.put(row));
}

export async function getInitialSnapshot(sessionId: string): Promise<TurnSnapshot | null> {
  const row = await tx<Row>('readonly', s => s.get(initialKey(sessionId)));
  return row?.snapshot ?? null;
}

export async function getTurnSnapshot(sessionId: string, round: number, combatantId: string): Promise<TurnSnapshot | null> {
  const row = await tx<Row>('readonly', s => s.get(turnKey(sessionId, round, combatantId)));
  return row?.snapshot ?? null;
}

export async function deleteSessionSnapshots(sessionId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tr = db.transaction(STORE, 'readwrite');
    const store = tr.objectStore(STORE);
    const range = IDBKeyRange.bound(`${sessionId}:`, `${sessionId}:z`, false, false);
    const req = store.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    tr.oncomplete = () => resolve();
    tr.onerror = () => reject(tr.error);
    tr.onabort = () => reject(tr.error);
  });
}

/**
 * 兜底：当 IndexedDB 中找不到目标 key 的回合快照时，
 * 回退策略：扫描 `sessionId` 下所有回合快照，取 `round<=targetRound` 中 round 最大的一个。
 * 这样即便"第一次进入某回合时快照还没写（race / 网络 / crash）"，也能找到最接近的可恢复状态。
 */
export async function getBestTurnSnapshot(
  sessionId: string, targetRound: number, targetCombatantId: string,
): Promise<{ snapshot: TurnSnapshot; round: number; combatantId: string; exact: boolean } | null> {
  const exact = await getTurnSnapshot(sessionId, targetRound, targetCombatantId);
  if (exact) return { snapshot: exact, round: targetRound, combatantId: targetCombatantId, exact: true };
  // 扫描全部前缀找"最接近且≤目标"的
  const exactInitial = await getInitialSnapshot(sessionId);
  let best: { snapshot: TurnSnapshot; round: number; combatantId: string } | null =
    exactInitial ? { snapshot: exactInitial, round: -1, combatantId: '' } : null;
  const db = await openDb();
  const rows = await new Promise<Row[]>((resolve, reject) => {
    const tr = db.transaction(STORE, 'readonly');
    const store = tr.objectStore(STORE);
    const range = IDBKeyRange.bound(`${sessionId}:`, `${sessionId}:z`, false, false);
    const req = store.getAll(range);
    req.onsuccess = () => resolve(req.result ?? []);
    tr.onerror = () => reject(tr.error);
  });
  for (const row of rows) {
    if (row.kind !== 'turn') continue;
    if ((row.round ?? -1) > targetRound) continue;
    if (
      !best ||
      (row.round ?? -1) > best.round ||
      ((row.round ?? -1) === best.round && row.combatantId === targetCombatantId)
    ) {
      best = { snapshot: row.snapshot, round: row.round ?? -1, combatantId: row.combatantId ?? '' };
    }
  }
  return best ? { ...best, exact: false } : null;
}

/** 删除指定回合快照（清理回溯后的旧快照，防止读到过期数据） */
export async function deleteTurnSnapshot(
  sessionId: string, round: number, combatantId: string,
): Promise<void> {
  await tx('readwrite', s => s.delete(turnKey(sessionId, round, combatantId)));
}

// 防御性导出：TypeScript 类型检查
export type { Combatant };
