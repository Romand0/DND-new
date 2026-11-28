// 剧情全周期管理：DM 剧情笔记树（本模块权威结构）
// 经济账本与道具的视图类型见文件末尾；源记录本身不在此定义。

export type StorySceneStatus = 'planned' | 'active' | 'done' | 'skipped';
export type StoryArcStatus = 'planned' | 'active' | 'closed';
export type StoryObjectiveKind = 'main' | 'side' | 'personal';
export type StoryObjectiveOutcome = 'pending' | 'met' | 'missed' | 'dropped';

export interface StoryEntityRef {
  kind: 'equipment' | 'spell' | 'monster' | 'rule';
  id: string;
  label: string;
}

export interface StorySnippet {
  id: string;
  text: string;
  refs?: StoryEntityRef[];
}

export interface StoryTime {
  gameDate?: string;
  gameMinute?: number;
  sessionNo?: number;
  order: number;
}

export interface StoryLocation {
  name: string;
  region?: string;
  battlegroundId?: string;
}

export interface StoryRoster {
  characterIds: string[];
  npcIds: string[];
  absentCharacterIds: string[];
}

export interface StoryPlannedObjective {
  id: string;
  kind: StoryObjectiveKind;
  title: string;
  assigneeIds: string[];
  outcome: StoryObjectiveOutcome;
}

export interface StoryCurrency {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export interface StoryPlannedReward {
  currency?: StoryCurrency;
  items?: { name: string; quantity: number; equipmentId?: string }[];
  experience?: number;
  notes?: string;
}

export interface StoryScene {
  id: string;
  chapterId: string;
  title: string;
  status: StorySceneStatus;
  time: StoryTime;
  location: StoryLocation;
  roster: StoryRoster;
  snippets: StorySnippet[];
  dmNotes?: string;
  plannedObjectives: StoryPlannedObjective[];
  plannedReward: StoryPlannedReward;
  dependsOn: string[];
  resultNotes?: string;
  settlementSummary?: string;
  combatRecordId?: string;
  skipReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoryChapter {
  id: string;
  title: string;
  summary: string;
  order: number;
  scenes: StoryScene[];
  createdAt: number;
  updatedAt: number;
}

export interface StoryArc {
  id: string;
  campaignId: string;
  title: string;
  summary: string;
  status: StoryArcStatus;
  chapters: StoryChapter[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type LedgerSourceKind = 'check' | 'item' | 'treasure' | 'spell' | 'growth';

export interface StoryLedgerLink {
  id: string;
  campaignId: string;
  sceneId: string;
  sourceKind: LedgerSourceKind;
  sourceId: string;
  characterId?: string;
  note?: string;
  occurredAt?: number;
  createdBy: string;
  createdAt: number;
}

export interface LedgerEntryView {
  linkId: string;
  sceneId: string;
  sourceKind: LedgerSourceKind;
  sourceId: string;
  characterId?: string;
  note?: string;
  title: string;
  amountText?: string;
  occurredAt: number;
  invalid?: boolean;
}

export interface LedgerSummary {
  itemCount: number;
  currency: StoryCurrency;
  experience: number;
  spellSlots: Record<number, number>;
}

export interface LedgerResponse {
  entries: LedgerEntryView[];
  summary: LedgerSummary;
}

export type HandoutKind = 'letter' | 'map' | 'notice' | 'other';

export interface StoryHandout {
  id: string;
  campaignId: string;
  sceneId?: string;
  kind: HandoutKind;
  title: string;
  body: string;
  imageUrl?: string;
  targetUserIds: string[];
  createdBy: string;
  createdAt: number;
  recalledAt?: number;
  readAt?: number;
  favoritedAt?: number;
  /** DM 视角已读人数；玩家视角同样返回但不作为主信息 */
  readCount?: number;
}
