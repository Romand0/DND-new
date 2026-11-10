// 三宝书种子加载器：静态种子文件（public/seed/）作为图鉴基线。
// 索引为唯一事实源，按索引 shards 并发拉取单库全部分片并拼接；版本号作幂等键，
// 版本变化时覆盖 localStorage 副本。种子与团组无关，全局一份缓存（不按团组分桶）。

export type SeedKind = 'equipments' | 'monsters' | 'options';

export interface SeedShard {
  book: string;
  group: string;
  path: string;
  count: number;
  bytes?: number;
  gzip?: number;
}

export interface SeedKindMeta {
  label: string;
  count: number;
  shards: SeedShard[];
}

export interface SeedIndex {
  version: string;
  generatedAt: string;
  kinds: Record<SeedKind, SeedKindMeta>;
  sources: string[];
}

const SEED_INDEX_PATH = '/seed/索引.json';

const VERSION_KEY = (kind: SeedKind) => `seed:${kind}:version`;
const DATA_KEY = (kind: SeedKind) => `seed:${kind}:data`;

// 会话级缓存：避免每次 getCachedSeed 都 JSON.parse 大列表（怪物/装备可达数百 KB）
const memoryCache = new Map<SeedKind, unknown[]>();
const inflight = new Map<SeedKind, Promise<unknown[]>>();
const listeners: (() => void)[] = [];

let indexPromise: Promise<SeedIndex | null> | null = null;

function notifySeed(): void {
  listeners.forEach((fn) => fn());
}

function encodeSeedPath(path: string): string {
  return '/seed/' + path.split('/').map(encodeURIComponent).join('/');
}

async function loadIndex(): Promise<SeedIndex | null> {
  if (!indexPromise) {
    indexPromise = fetch(encodeURI(SEED_INDEX_PATH))
      .then((res) => (res.ok ? (res.json() as Promise<SeedIndex>) : null))
      .catch((err) => {
        console.warn('[seedLoader] 索引加载失败:', err);
        return null;
      });
  }
  return indexPromise;
}

function readCachedData<T>(kind: SeedKind): T[] | null {
  if (memoryCache.has(kind)) return memoryCache.get(kind) as T[];
  try {
    const raw = localStorage.getItem(DATA_KEY(kind));
    if (raw) {
      const parsed = JSON.parse(raw) as T[];
      memoryCache.set(kind, parsed);
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 加载某库种子（按索引 shards 并发拉取）。
 * 版本一致且有缓存 → 直接返回，不发网络请求；否则并发拉全部 shard，拼接后写缓存。
 */
export async function loadSeed<T = unknown>(kind: SeedKind): Promise<T[]> {
  const cached = readCachedData<T>(kind);
  const idx = await loadIndex();
  if (!idx) return cached ?? [];

  const meta = idx.kinds[kind];
  if (!meta) return cached ?? [];

  let cachedVersion: string | null = null;
  try {
    cachedVersion = localStorage.getItem(VERSION_KEY(kind));
  } catch {
    // ignore
  }

  if (cached && cachedVersion === idx.version) return cached;
  if (inflight.has(kind)) return inflight.get(kind) as Promise<T[]>;

  const task = Promise.all(
    meta.shards.map((shard) =>
      fetch(encodeURI(encodeSeedPath(shard.path)))
        .then((res) => (res.ok ? (res.json() as Promise<T[]>) : []))
        .catch((err) => {
          console.warn(`[seedLoader] 分片加载失败 ${shard.path}:`, err);
          return [] as T[];
        })
    )
  )
    .then((parts) => {
      const merged = parts.flat();
      memoryCache.set(kind, merged);
      try {
        localStorage.setItem(DATA_KEY(kind), JSON.stringify(merged));
        localStorage.setItem(VERSION_KEY(kind), idx.version);
      } catch (e) {
        console.warn('[seedLoader] 种子写入 localStorage 失败:', e);
      }
      notifySeed();
      return merged;
    })
    .finally(() => {
      inflight.delete(kind);
    });

  inflight.set(kind, task as Promise<unknown[]>);
  return task;
}

/** 同步读取已缓存副本（未加载完成返回 null，供 store 首帧渲染判断） */
export function getCachedSeed<T = unknown>(kind: SeedKind): T[] | null {
  return readCachedData<T>(kind);
}

/** 订阅任意库种子就绪（store 用它触发 notify 重渲染） */
export function subscribeSeed(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** 预热指定库（页面打开/App 启动时调用，不阻塞首帧） */
export function warmSeed(kind: SeedKind): void {
  void loadSeed(kind);
}
