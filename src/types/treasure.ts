// 宝藏系统类型定义
import type { Equipment } from './character';

export interface TreasureItem {
  id: string;
  name: string;
  quantity: number;
  /** 单价（货币单位：铜币） */
  unitPrice?: number;
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
