// 宝藏系统类型定义
import type { Equipment } from './character';

/** 单价可选的货币单位（与宝藏钱币口径一致，含铂金币） */
export type TreasurePriceUnit = 'pp' | 'gp' | 'sp' | 'cp';

export interface TreasurePrice {
  amount: number;
  unit: TreasurePriceUnit;
}

export interface TreasureItem {
  id: string;
  name: string;
  quantity: number;
  /** 单价（含货币单位，如 2gp / 50cp） */
  unitPrice?: TreasurePrice;
  /** 分类（用于背包整理，如武器/护甲/法器/工具/药水/杂物） */
  category?: string;
  /** 子分类（装备库细分类别） */
  subCategory?: string;
  /** 重量（磅） */
  weight?: number;
  /** 从装备库引入的装备快照（自定义物品时可为空） */
  equipmentSnapshot?: Equipment;
}

export interface TreasureCurrency {
  pp: number;
  gp: number;
  sp: number;
  cp: number;
}

export interface Treasure {
  id: string;
  title: string;
  /** 钱币 */
  currency: TreasureCurrency;
  /** 物品列表 */
  items: TreasureItem[];
  createdAt: number;
  updatedAt: number;
}

/** 分配记录：某个角色从某个宝藏分到了什么 */
export interface DistributionRecord {
  treasureId: string;
  characterId: string;
  characterName: string;
  /** 分到的货币 */
  currency: TreasureCurrency;
  /** 分到的物品 */
  items: TreasureItem[];
  distributedAt: number;
}
