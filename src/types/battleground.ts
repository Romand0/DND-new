// 网格沙盘类型定义
import type { DamageType } from '@/types/damage';

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

/** 特殊区域类型（地形效果） */
export type ZoneType = 'fire' | 'poison' | 'difficult' | 'custom';

/** 光照档位（视野系统 R2）：明亮 / 微光 / 黑暗 */
export type LightTier = 'bright' | 'dim' | 'darkness';

/** 光照画笔格桶：每档位独立的格子集合（同格由画笔互斥，最后涂的档位生效） */
export interface LightCells {
  bright: string[];
  dim: string[];
  darkness: string[];
}

export const LIGHT_LABELS: Record<LightTier, string> = {
  bright: '明亮',
  dim: '微光',
  darkness: '黑暗',
};

/**
 * 光照层渲染遮罩色：按「真实亮暗」压暗格内一切内容（含棋子），三档区分度靠明度而非色相。
 * bright 是自然状态，不叠任何图层（transparent，判空即不渲染）；dim 中灰压暗；
 * darkness 深黑压暗但保留可视性（配合格子内棋子的白色轮廓，避免黑暗格内棋子糊成一团）。
 */
export const LIGHT_OVERLAY: Record<LightTier, string> = {
  bright: 'transparent',
  dim: 'rgba(8, 12, 22, 0.38)',
  darkness: 'rgba(3, 6, 14, 0.66)',
};

/**
 * 沙盘地形区域（着火、毒云等）。
 * 规则基线：《玩家手册 2014》油瓶 —— 进入区域或在区域内结束回合时受到伤害，
 * 同一生物每回合只受一次；持续回合数到期自动消失。
 */
export interface BattlegroundZone {
  id: string;
  type: ZoneType;
  label: string;
  /** 覆盖的格子，格式 "col,row" */
  cells: string[];
  /** 区域着色（CSS 颜色） */
  color: string;
  /** 进入 / 回合结束时的伤害 */
  damage?: {
    amount: number;
    damageType: DamageType;
    /** 魔法伤害（法术创造的区域）；油瓶等普通火焰为非魔法 */
    magical?: boolean;
  };
  /** 创建时的回合（放映模式）；模拟模式为 0 */
  createdRound?: number;
  /** 最后一个生效回合；缺省 = 永久，需手动移除 */
  expireRound?: number;
  /** 持续回合数规格（0 = 永久）；过期判定在落地时换算成 expireRound，本字段供回显 */
  durationRounds?: number;
  /** 来源说明（法术名 / DM 手绘） */
  source?: string;
  /** 已受伤记录：combatantId -> 该次伤害发生的回合号（同回合不重复） */
  hitRounds?: Record<string, number>;
}

/** 区域预设：DM 画笔与流程节点共用的默认参数 */
export interface ZonePreset {
  type: ZoneType;
  label: string;
  color: string;
  damage?: {
    amount: number;
    damageType: DamageType;
    magical?: boolean;
  };
  /** 默认持续回合数；0 = 永久（需手动移除） */
  durationRounds: number;
  description: string;
}

export const ZONE_PRESETS: Record<ZoneType, ZonePreset> = {
  fire: {
    type: 'fire',
    label: '着火区域',
    color: 'rgba(249, 115, 22, 0.45)',
    damage: { amount: 5, damageType: '火焰', magical: false },
    durationRounds: 2,
    description: '进入或在区域内结束回合时受 5 点火焰伤害，同一生物每回合一次（油瓶 2 轮）',
  },
  poison: {
    type: 'poison',
    label: '毒云区域',
    color: 'rgba(132, 204, 22, 0.4)',
    damage: { amount: 1, damageType: '毒素', magical: true },
    durationRounds: 0,
    description: '通用毒素地形，默认每次 1 点毒素伤害，持续到手动移除',
  },
  difficult: {
    type: 'difficult',
    label: '困难地形',
    color: 'rgba(148, 163, 184, 0.35)',
    durationRounds: 0,
    description: '仅作视觉标记（移动力减半需 DM 手动判定），不产生伤害',
  },
  custom: {
    type: 'custom',
    label: '自定义区域',
    color: 'rgba(56, 189, 248, 0.35)',
    durationRounds: 0,
    description: '自定义伤害与持续时间，由 DM 现场配置',
  },
};

/** 单场战斗的沙盘数据 */
export interface Battleground {
  sessionId: string;
  size: GridSize;
  tokens: TokenPosition[];
  /** 掉落物品 token 列表（可与角色 token 同格） */
  itemTokens?: ItemToken[];
  /** 被涂白的格子（边界墙），格式为 "col,row" */
  paintedCells?: string[];
  /** 环境光照档位（无光照区域覆盖时的全图默认；未设置视为明亮） */
  ambientLight?: LightTier;
  /** 光照区域格桶（视野系统 R2：DM 光照画笔标注，覆盖环境档位） */
  lightCells?: LightCells;
  /** 地形区域列表（着火、毒云等） */
  zones?: BattlegroundZone[];
  updatedAt: number;
  /** 移动历史栈，最多保留 5 条，用于撤回 */
  moveHistory?: TokenPosition[][];
}
