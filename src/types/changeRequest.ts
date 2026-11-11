// 角色卡变更请求契约 —— 玩家提交 / DM 审批回路的共享类型

import type { Character } from './character';

/** 字段级 diff 行（玩家提交摘要与 DM 审批弹窗共用，lib/characterDiff.ts 产出） */
export interface CharacterDiffRow {
  /** 展示路径（如「属性·力量」「装备·长剑×2」「特性·回气」） */
  path: string;
  before: string;
  after: string;
  kind: 'add' | 'remove' | 'change';
}

export interface ChangeRequest {
  id: string;
  campaignId: string;
  characterId: string;
  characterName?: string;
  requesterId: string;
  requesterName?: string;
  /** 变更后的完整角色卡快照（批准时以此为准写入正式卡） */
  payload: Character;
  /** 提交时基于的正式卡 updatedAt，供审批端检测版本漂移 */
  baseUpdatedAt: number;
  note?: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reviewNote?: string;
  reviewerId?: string;
  createdAt: number;
  reviewedAt?: number;
}

/** 后端列表行（payload 已 JSON.parse，附角色卡名与请求者名） */
export type ChangeRequestRow = ChangeRequest;
