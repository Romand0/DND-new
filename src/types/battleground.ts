// 网格沙盘类型定义
export type GridSize = 'small' | 'medium' | 'large';

export interface GridSizePreset {
  size: GridSize;
  cols: number;
  rows: number;
  label: string;
}

/** 三种大小预设：小型 12x18 / 中型 24x36 / 大型 36x54（cols x rows） */
export const GRID_PRESETS: Record<GridSize, GridSizePreset> = {
  small: { size: 'small', cols: 12, rows: 18, label: '小型 12×18' },
  medium: { size: 'medium', cols: 24, rows: 36, label: '中型 24×36' },
  large: { size: 'large', cols: 36, rows: 54, label: '大型 36×54' },
};

/** 棋子位置：关联参战者 ID + 网格坐标 */
export interface TokenPosition {
  combatantId: string;
  col: number;
  row: number;
}

/** 掉落物品 token（如投掷武器落地后） */
export interface ItemToken {
  id: string;              // 唯一 token id
  col: number;
  row: number;
  name: string;            // 物品名称
  /** 装备快照数据，拾起时用于加入背包 */
  equipmentData: Record<string, unknown>;
  /** 掉落者 combatantId */
  droppedBy?: string;
}

/** 单场战斗的沙盘数据 */
export interface Battleground {
  sessionId: string;
  size: GridSize;
  tokens: TokenPosition[];
  /** 掉落物品 token 列表（可与角色 token 同格） */
  itemTokens?: ItemToken[];
  updatedAt: number;
  /** 移动历史栈，最多保留 5 条，用于撤回 */
  moveHistory?: TokenPosition[][];
}
