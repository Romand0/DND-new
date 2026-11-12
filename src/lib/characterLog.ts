// 角色全周期日志：前端上报队列。
// 埋点写点（store 方法/战斗/审批）调 pushCharacterLog 入内存队列（localStorage 持久防丢），
// debounce 批量 flush 到 POST /api/character-logs；失败保留队列下次重试。
// 队列上限 200 条（防离线积压爆盘），超出丢最旧。

import type { CharacterLogCategory, CharacterLogKind } from '@/types/characterLog';

const QUEUE_KEY = 'dnd-character-log-queue';
const MAX_QUEUE = 200;
const FLUSH_DELAY_MS = 8000;

interface QueueEntry {
  characterId: string;
  category: CharacterLogCategory;
  kind: CharacterLogKind | string;
  title: string;
  detail?: string;
  source?: string;
}

let queue: QueueEntry[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function loadQueue(): QueueEntry[] {
  if (queue) return queue;
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    queue = raw ? (JSON.parse(raw) as QueueEntry[]) : [];
  } catch {
    queue = [];
  }
  return queue;
}

function persistQueue(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(loadQueue().slice(-MAX_QUEUE)));
  } catch {
    // 持久化失败仅影响刷新恢复，内存队列继续工作
  }
}

async function flush(): Promise<void> {
  if (flushing) return;
  const entries = loadQueue();
  if (entries.length === 0) return;
  flushing = true;
  try {
    const { apiFetch } = await import('@/lib/api');
    await apiFetch('/character-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    });
    // 成功：清掉已上报部分（flush 期间新入队的条目保留）
    const current = loadQueue();
    queue = current.slice(entries.length);
    persistQueue();
  } catch {
    // 云端不可用：保留队列，下次写入或 flush 重试
  } finally {
    flushing = false;
  }
}

/** 埋点写点调用：入队 + 安排 debounce flush */
export function pushCharacterLog(
  characterId: string,
  entry: { category: CharacterLogCategory; kind: CharacterLogKind | string; title: string; detail?: string; source?: string },
): void {
  if (!characterId || !entry.title) return;
  const q = loadQueue();
  q.push({
    characterId,
    category: entry.category,
    kind: entry.kind,
    title: entry.title.slice(0, 500),
    detail: entry.detail,
    source: entry.source,
  });
  if (q.length > MAX_QUEUE) queue = q.slice(-MAX_QUEUE);
  persistQueue();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { void flush(); }, FLUSH_DELAY_MS);
}

/** 变更请求批准入库：diff 行按领域聚合上报（source=change_request）。
 *  货币/经验/等级行跳过——这三类由 updateCharacter 埋点统一记录（无论 DM 手改还是批准入库），避免双记 */
export function logChangeRequestApplied(
  characterId: string,
  rows: { path: string; before: string; after: string; kind: 'add' | 'remove' | 'change' }[],
): void {
  // path 前缀 → 领域映射（与 characterDiff 的 path 命名约定一致）
  const areaOf = (path: string): CharacterLogCategory => {
    if (path.startsWith('装备') || path.startsWith('货币')) return 'item';
    if (path.startsWith('法术')) return 'spell';
    if (path.startsWith('属性') || path.startsWith('等级') || path.startsWith('经验') || path.startsWith('技能') || path.startsWith('特性')) return 'growth';
    return 'general';
  };
  const groups = new Map<CharacterLogCategory, string[]>();
  for (const r of rows) {
    if (r.path.startsWith('货币') || r.path.startsWith('经验值') || r.path.startsWith('等级')) continue;
    const area = areaOf(r.path);
    const text = r.kind === 'add' ? `${r.path}：新增（${r.after}）`
      : r.kind === 'remove' ? `${r.path}：移除（${r.before}）`
      : `${r.path}：${r.before} → ${r.after}`;
    const arr = groups.get(area) ?? [];
    arr.push(text);
    groups.set(area, arr);
  }
  for (const [area, texts] of groups) {
    const category: CharacterLogCategory = area === 'general' ? 'general' : area;
    pushCharacterLog(characterId, {
      category,
      kind: 'cr_applied',
      title: `变更请求入库（${texts.length} 处）：${texts.slice(0, 5).join('；')}${texts.length > 5 ? ' 等' : ''}`,
      detail: JSON.stringify({ rows }),
      source: 'change_request',
    });
  }
}

/** 手动触发上报（页面卸载前/测试用） */
export function flushCharacterLogs(): void {
  void flush();
}
