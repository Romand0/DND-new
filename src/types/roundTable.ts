// 圆桌消息信箱类型（与 functions/api/table/_shared.ts 同构）
import type { AbilityKey } from './character';

export type TableMessageType = 'check_request' | 'check_result' | 'spectate_invite';
export type TableMessageStatus = 'pending' | 'answered' | 'cancelled';

/** 检定类别：属性检定 / 技能检定 / 豁免检定 */
export type CheckKind = 'ability' | 'skill' | 'save';

/** DC 可见性模式：明牌 / 隐藏 DC 显判定 / 仅回传数值 */
export type DcMode = 'open' | 'hidden_dc' | 'value_only';

export interface CheckRequestPayload {
  characterId: string;
  characterName: string;
  checkKind: CheckKind;
  checkKey: string;
  checkLabel: string;
  dc: number;
  dcMode: DcMode;
  note: string;
}

export interface CheckBonusItem {
  label: string;
  value: number;
}

export interface CheckResultPayload {
  replyTo: string;
  d20s: number[];
  d20Kept: number;
  rollMode: 'advantage' | 'disadvantage' | 'none';
  modeReasons: string[];
  bonuses: CheckBonusItem[];
  appliedValue: number;
  autoOutcome: 'success' | 'fail' | null;
  submittedAt: number;
}

/** DM 抛送的观战邀请：玩家一键加入实时战斗房间（/player/spectate?room=<roomId>） */
export interface SpectateInvitePayload {
  roomId: string;
  title: string;
}

export interface TableMessage {
  id: string;
  campaignId: string | null;
  fromUserId: string;
  toUserId: string;
  type: TableMessageType;
  payload: CheckRequestPayload | CheckResultPayload | SpectateInvitePayload;
  status: TableMessageStatus;
  replyMessageId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BoundCharacterInfo {
  id: string;
  name: string;
  class: string;
  level: number;
  race: string;
  boundUserName?: string;
}

/** 技能 key → 中文名 + 关联能力（18 技能，与 types/character.ts Skills 字段同名） */
export const SKILL_LABELS: Record<string, { label: string; ability: AbilityKey }> = {
  acrobatics: { label: '特技', ability: 'dexterity' },
  animalHandling: { label: '驯兽', ability: 'wisdom' },
  arcana: { label: '奥秘', ability: 'intelligence' },
  athletics: { label: '运动', ability: 'strength' },
  deception: { label: '欺瞒', ability: 'charisma' },
  history: { label: '历史', ability: 'intelligence' },
  insight: { label: '洞悉', ability: 'wisdom' },
  intimidation: { label: '威吓', ability: 'charisma' },
  investigation: { label: '调查', ability: 'intelligence' },
  medicine: { label: '医药', ability: 'wisdom' },
  nature: { label: '自然', ability: 'intelligence' },
  perception: { label: '察觉', ability: 'wisdom' },
  performance: { label: '表演', ability: 'charisma' },
  persuasion: { label: '游说', ability: 'charisma' },
  religion: { label: '宗教', ability: 'intelligence' },
  sleightOfHand: { label: '巧手', ability: 'dexterity' },
  stealth: { label: '隐匿', ability: 'dexterity' },
  survival: { label: '生存', ability: 'wisdom' },
};

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};
