// 网格沙盘本地存储 —— 按 sessionId 索引，独立于战斗记录
import type { Battleground, GridSize, TokenPosition, ItemToken } from '@/types/battleground';
import { GRID_PRESETS } from '@/types/battleground';

const STORAGE_KEY = 'dnd-battlegrounds';
type Listener = () => void;

let listeners: Listener[] = [];

// 进程内缓存：避免每次读都全量 parse localStorage。
// 所有写操作都必须经过 saveAll()，否则缓存不会失效。
let battlegroundCache: Battleground[] | null = null;

// 跨标签页一致性：其它标签页写入 localStorage 后，让本页缓存失效
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) battlegroundCache = null;
  });
}

function notify(): void {
  listeners.forEach((l) => l());
}

function loadAll(): Battleground[] {
  if (battlegroundCache) return battlegroundCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr: unknown[] = JSON.parse(raw);
    return arr.map((b: any) => ({
      sessionId: b.sessionId,
      size: (['small', 'medium', 'large'].includes(b.size) ? b.size : 'medium') as GridSize,
      tokens: Array.isArray(b.tokens)
        ? b.tokens.map((t: any) => ({
            combatantId: t.combatantId,
            col: Number(t.col) || 0,
            row: Number(t.row) || 0,
          }))
        : [],
      updatedAt: b.updatedAt ?? Date.now(),
      moveHistory: Array.isArray(b.moveHistory) ? b.moveHistory : [],
      itemTokens: Array.isArray(b.itemTokens) ? b.itemTokens.map((t: any) => ({
        id: t.id,
        col: Number(t.col) || 0,
        row: Number(t.row) || 0,
        name: t.name || '物品',
        equipmentData: t.equipmentData || {},
        droppedBy: t.droppedBy,
      })) : [],
      paintedCells: Array.isArray(b.paintedCells)
        ? b.paintedCells.filter((s: any) => typeof s === 'string')
        : [],
    }));
  } catch {
    return [];
  }
}

function saveAll(list: Battleground[]): void {
  battlegroundCache = list;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    notify();
  } catch (e) {
    console.error('沙盘数据保存失败:', e);
  }
}

const battlegroundStore = {
  /**
   * 获取某场战斗的沙盘；不存在则按默认中型创建
   */
  getOrCreate(sessionId: string): Battleground {
    const list = loadAll();
    let bg = list.find((b) => b.sessionId === sessionId);
    if (!bg) {
      bg = {
        sessionId,
        size: 'medium', // 默认中型
        tokens: [],
        itemTokens: [],
        paintedCells: [],
        moveHistory: [],
        updatedAt: Date.now(),
      };
      list.push(bg);
      saveAll(list);
    }
    // 浅拷贝：防止调用方 mutate 污染内存缓存
    return { ...bg, tokens: [...bg.tokens], itemTokens: [...(bg.itemTokens ?? [])], paintedCells: [...(bg.paintedCells ?? [])], moveHistory: [...(bg.moveHistory ?? [])] };
  },

  /** 直接获取（不创建） */
  get(sessionId: string): Battleground | null {
    const found = loadAll().find((b) => b.sessionId === sessionId) ?? null;
    if (!found) return null;
    // 浅拷贝：防止调用方 mutate 污染内存缓存
    return { ...found, tokens: [...found.tokens], itemTokens: [...(found.itemTokens ?? [])], paintedCells: [...(found.paintedCells ?? [])], moveHistory: [...(found.moveHistory ?? [])] };
  },

  /** 切换沙盘大小，超出新边界的棋子会被裁掉 */
  setSize(sessionId: string, size: GridSize): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    const preset = GRID_PRESETS[size];
    list[idx] = {
      ...list[idx],
      size,
      tokens: list[idx].tokens.filter(
        (t) => t.col < preset.cols && t.row < preset.rows
      ),
      paintedCells: (list[idx].paintedCells || []).filter((s) => {
        const [c, r] = s.split(',').map(Number);
        return c < preset.cols && r < preset.rows;
      }),
      updatedAt: Date.now(),
    };
    saveAll(list);
  },

  /** 放置/移动棋子到指定坐标（覆盖该参战者旧位置，同格已有其他棋子则顶替） */
  placeToken(sessionId: string, token: TokenPosition): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    const preset = GRID_PRESETS[list[idx].size];
    // 越界保护
    if (token.col < 0 || token.col >= preset.cols || token.row < 0 || token.row >= preset.rows) return;
    // 保存移动前快照到历史栈（最多 5 条）
    const history = list[idx].moveHistory ?? [];
    const snapshot = list[idx].tokens.map((t) => ({ ...t }));
    history.push(snapshot);
    if (history.length > 5) history.shift();
    // 移除该参战者的旧位置 + 移除目标格上的其他棋子
    const tokens = list[idx].tokens.filter(
      (t) => t.combatantId !== token.combatantId && !(t.col === token.col && t.row === token.row)
    );
    tokens.push(token);
    list[idx] = { ...list[idx], tokens, moveHistory: history, updatedAt: Date.now() };
    saveAll(list);
  },

  /** 移除指定参战者的棋子 */
  removeToken(sessionId: string, combatantId: string): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    // 保存移除前快照到历史栈
    const history = list[idx].moveHistory ?? [];
    const snapshot = list[idx].tokens.map((t) => ({ ...t }));
    history.push(snapshot);
    if (history.length > 5) history.shift();
    list[idx] = {
      ...list[idx],
      tokens: list[idx].tokens.filter((t) => t.combatantId !== combatantId),
      moveHistory: history,
      updatedAt: Date.now(),
    };
    saveAll(list);
  },

  /** 撤回上一次移动，返回 true 表示成功撤回 */
  undoMove(sessionId: string): boolean {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return false;
    const history = list[idx].moveHistory ?? [];
    if (history.length === 0) return false;
    const prevTokens = history.pop()!;
    list[idx] = { ...list[idx], tokens: prevTokens, moveHistory: history, updatedAt: Date.now() };
    saveAll(list);
    return true;
  },

  /** 获取可撤回次数 */
  getUndoCount(sessionId: string): number {
    const bg = this.get(sessionId);
    return bg?.moveHistory?.length ?? 0;
  },

  /** 放置掉落物品 token（投掷武器落地等） */
  placeItemToken(sessionId: string, token: ItemToken): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    const preset = GRID_PRESETS[list[idx].size];
    if (token.col < 0 || token.col >= preset.cols || token.row < 0 || token.row >= preset.rows) return;
    if (!list[idx].itemTokens) list[idx].itemTokens = [];
    list[idx].itemTokens!.push(token);
    list[idx] = { ...list[idx], updatedAt: Date.now() };
    saveAll(list);
  },

  /** 移除掉落物品 token（拾起后） */
  removeItemToken(sessionId: string, tokenId: string): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    list[idx] = {
      ...list[idx],
      itemTokens: (list[idx].itemTokens || []).filter((t) => t.id !== tokenId),
      updatedAt: Date.now(),
    };
    saveAll(list);
  },

  /** 切换某个格子的涂白状态 */
  togglePaintedCell(sessionId: string, cell: string): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    const cells = new Set(list[idx].paintedCells || []);
    if (cells.has(cell)) cells.delete(cell);
    else cells.add(cell);
    list[idx] = { ...list[idx], paintedCells: [...cells], updatedAt: Date.now() };
    saveAll(list);
  },

  /** 清除所有涂白格子 */
  clearPaintedCells(sessionId: string): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], paintedCells: [], updatedAt: Date.now() };
    saveAll(list);
  },

  /** 清空所有棋子 */
  clearTokens(sessionId: string): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], tokens: [], updatedAt: Date.now() };
    saveAll(list);
  },

  /** 删除整张沙盘（战斗删除时调用） */
  delete(sessionId: string): void {
    saveAll(loadAll().filter((b) => b.sessionId !== sessionId));
  },

  /** 替换整张沙盘的棋子（放映模式重置用） */
  setTokens(sessionId: string, tokens: TokenPosition[]): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], tokens, updatedAt: Date.now() };
    saveAll(list);
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

export default battlegroundStore;
