// 网格沙盘本地存储 —— 按 sessionId 索引，独立于战斗记录
import type { Battleground, GridSize, TokenPosition } from '@/types/battleground';
import { GRID_PRESETS } from '@/types/battleground';

const STORAGE_KEY = 'dnd-battlegrounds';
type Listener = () => void;

let listeners: Listener[] = [];

function notify(): void {
  listeners.forEach((l) => l());
}

function loadAll(): Battleground[] {
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
    }));
  } catch {
    return [];
  }
}

function saveAll(list: Battleground[]): void {
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
        updatedAt: Date.now(),
      };
      list.push(bg);
      saveAll(list);
    }
    return bg;
  },

  /** 直接获取（不创建） */
  get(sessionId: string): Battleground | null {
    return loadAll().find((b) => b.sessionId === sessionId) ?? null;
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
    // 移除该参战者的旧位置 + 移除目标格上的其他棋子
    const tokens = list[idx].tokens.filter(
      (t) => t.combatantId !== token.combatantId && !(t.col === token.col && t.row === token.row)
    );
    tokens.push(token);
    list[idx] = { ...list[idx], tokens, updatedAt: Date.now() };
    saveAll(list);
  },

  /** 移除指定参战者的棋子 */
  removeToken(sessionId: string, combatantId: string): void {
    const list = loadAll();
    const idx = list.findIndex((b) => b.sessionId === sessionId);
    if (idx === -1) return;
    list[idx] = {
      ...list[idx],
      tokens: list[idx].tokens.filter((t) => t.combatantId !== combatantId),
      updatedAt: Date.now(),
    };
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

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

export default battlegroundStore;
