// 角色全周期日志契约 —— 三大重点领域（物资钱币/法术/角色成长）+ 其他变更的入库记录

/** 领域分类：日志筛选 chips 与存储列共用 */
export type CharacterLogCategory = 'item' | 'spell' | 'growth' | 'general';

/** 细分动作（kind 枚举保持开放，未列出的走 general/free-form） */
export type CharacterLogKind =
  // 物资钱币
  | 'item_acquire'      // 获得装备（拾取/购买/宝藏分配/导入）
  | 'item_remove'       // 移除装备
  | 'item_qty'          // 数量变化（消耗/补充）
  | 'currency'          // 钱币变化
  // 法术
  | 'spell_cast'        // 施法记录（战斗中施放）
  | 'slot_change'       // 法术位变化（消耗/恢复/并入）
  | 'slot_reset'        // 法术位重置（长休等）
  | 'spell_learn'       // 学得/移除法术（戏法与自定义法术列表变化）
  // 角色成长
  | 'exp_change'        // 经验值变更
  | 'level_up'          // 等级变化
  | 'growth_task'       // 角色成长任务（升级主动决策，功能预留——暂不产生数据）
  // 其他
  | 'cr_applied'        // 变更请求批准入库（聚合行）
  | 'dm_edit';          // DM 手动编辑（重点领域之外的字段变更兜底）

export interface CharacterLog {
  id: string;
  campaignId: string;
  characterId: string;
  category: CharacterLogCategory;
  kind: CharacterLogKind | string;
  /** 一行摘要（如「长剑 ×2（+1）」「消耗 2 环法术位」「经验值 1200 → 1550」） */
  title: string;
  /** JSON 补充：前后值、法术位环级、成长任务选项（预留）等 */
  detail?: string;
  /** 来源：battle（战斗结算/战斗中）/ change_request / store / import / growth_task */
  source?: string;
  /** 操作发起者账号 id（玩家提交/DM 编辑） */
  actorId?: string;
  createdAt: number;
}

/** 成长任务日志 detail 载荷（预留接口：升级主动决策任务完成时写入） */
export interface GrowthTaskDetail {
  taskId: string;
  taskName: string;
  /** 玩家做出的决策选项（自由结构，随任务类型定义） */
  choices?: Record<string, unknown>;
  /** 触发等级 */
  atLevel?: number;
}
