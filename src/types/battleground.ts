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

/** 单场战斗的沙盘数据 */
export interface Battleground {
  sessionId: string;
  size: GridSize;
  tokens: TokenPosition[];
  updatedAt: number;
}
