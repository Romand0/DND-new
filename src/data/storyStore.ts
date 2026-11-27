// 剧情笔记本地存储：localStorage 缓存 + 云端拉取 + 保存冲突提示。
// 笔记为 DM 独占写入，玩家端不读取本 store。
import type { StoryArc } from '@/types/story';
import { scopedKey } from '@/data/campaignScope';
import { hasAuthToken } from '@/lib/api';
import { fetchStoryArcs, saveStoryArc, deleteStoryArc } from '@/lib/storyApi';

const storageKey = () => scopedKey('dnd-story');
type Listener = () => void;

let listeners: Listener[] = [];
let cache: StoryArc[] | null = null;
let pulled = false;
let pulling: Promise<void> | null = null;
// 本地已保存但云端未确认的弧：拉取时若本地更新时间更新则保留
const dirty = new Set<string>();
// 最近一次与服务端一致的更新时间，用于乐观锁基线
const syncedAt = new Map<string, number>();

function notify(): void {
  listeners.forEach(l => l());
}

function load(): StoryArc[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return (cache = []);
    const list = JSON.parse(raw);
    cache = (Array.isArray(list) ? list : []).map((a: any) => ({
      ...a,
      id: a.id || '',
      campaignId: a.campaignId || '',
      title: a.title || '未命名剧情线',
      summary: a.summary || '',
      status: a.status || 'planned',
      chapters: Array.isArray(a.chapters) ? a.chapters : [],
      createdBy: a.createdBy || '',
      createdAt: a.createdAt ?? Date.now(),
      updatedAt: a.updatedAt ?? Date.now(),
    }));
    return cache;
  } catch {
    return (cache = []);
  }
}

function save(list: StoryArc[]): void {
  cache = list;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(list));
    notify();
  } catch (e) {
    console.error('剧情笔记保存失败:', e);
  }
}

function mergeRemote(remote: StoryArc[]): StoryArc[] {
  const local = load();
  const byId = new Map(local.map(a => [a.id, a]));
  for (const arc of remote) {
    const existing = byId.get(arc.id);
    if (existing && dirty.has(arc.id) && existing.updatedAt > arc.updatedAt) continue;
    byId.set(arc.id, arc);
    syncedAt.set(arc.id, arc.updatedAt);
    dirty.delete(arc.id);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 拉取云端剧情线（每会话首次 + 手动刷新）；失败保留本地缓存 */
async function pull(force = false): Promise<void> {
  if (!hasAuthToken()) return;
  if (pulling) return pulling;
  if (pulled && !force) return;
  pulling = (async () => {
    try {
      const remote = await fetchStoryArcs();
      save(mergeRemote(remote));
      pulled = true;
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}

const storyStore = {
  getAll(): StoryArc[] {
    return [...load()].sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get(id: string): StoryArc | null {
    return load().find(a => a.id === id) ?? null;
  },
  /** 本地 upsert + 云端保存；409 抛出由页面提示刷新 */
  async saveArc(arc: StoryArc): Promise<StoryArc> {
    const stamped: StoryArc = { ...arc, updatedAt: Date.now() };
    const base = syncedAt.get(stamped.id);
    save([stamped, ...load().filter(a => a.id !== stamped.id)]);
    dirty.add(stamped.id);
    if (!hasAuthToken()) return stamped;
    try {
      const saved = await saveStoryArc(stamped, base);
      syncedAt.set(saved.id, saved.updatedAt);
      dirty.delete(saved.id);
      save([saved, ...load().filter(a => a.id !== saved.id)]);
      return saved;
    } catch (e) {
      throw e;
    }
  },
  async removeArc(id: string): Promise<void> {
    save(load().filter(a => a.id !== id));
    dirty.delete(id);
    syncedAt.delete(id);
    if (!hasAuthToken()) return;
    await deleteStoryArc(id);
  },
  isDirty(id: string): boolean {
    return dirty.has(id);
  },
  pull,
  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },
};

export default storyStore;
