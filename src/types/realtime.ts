// 实时房间协议类型（前端侧镜像）
// 与 realtime/src/index.ts 的 ClientMessage / ServerMessage 保持同步——改协议时两处一起改。
// 前端不 import realtime 源码，避免 Workers 类型（DurableObjectState 等）进入浏览器构建。

export interface SessionMeta {
  clientId: string;
  userId: string;
  role: string;
  joinedAt: number;
}

export type ClientMessage =
  | { t: 'ping' }
  | { t: 'echo'; payload: unknown }
  | { t: 'snapshot.request' }
  | { t: 'combat.delta'; payload: CombatDeltaPayload };

export type ServerMessage =
  | { t: 'welcome'; clientId: string; userId: string; role: string; roomId: string; seq: number; members: SessionMeta[] }
  | { t: 'members'; members: SessionMeta[] }
  | { t: 'pong'; at: number }
  | { t: 'echo'; payload: unknown; from: SessionMeta }
  | { t: 'combat.delta'; seq: number; payload: CombatDeltaPayload; from: SessionMeta; at: number }
  | { t: 'snapshot'; seq: number; deltas: { seq: number; payload: unknown; at: number }[] }
  | { t: 'error'; message: string };

// ======================
// combat.delta payload（v1）
// ======================
// 服务端（realtime Worker）对 payload 完全透传，不解析内容——协议演进只涉及 DM 发送方
// 与玩家接收方两端，此处是唯一事实源。payload 是「幂等快照」而非细粒度补丁：
// 每条消息自包含完整观战投影，接收方整体替换状态，无 diff/合并逻辑，断线重连
// （snapshot.request 补最近 delta）后直接取最后一条即恢复到最新。

export interface CombatRosterEntry {
  id: string;
  name: string;
  isPc: boolean;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number | null;
  initiative: number;
  downed: boolean;
  incapacitated: boolean;
  concentrating: boolean;
  dead: boolean;
}

export interface CombatTurnState {
  round: number;
  combatantId: string | null;
  playback: boolean;
}

/** 沙盘观战投影：棋子/物品/墙体/地形区域；不含 equipmentData（背包隐私）与移动历史等 DM 侧数据 */
export interface BoardProjection {
  size: 'small' | 'medium' | 'large';
  tokens: { combatantId: string; col: number; row: number }[];
  items: { id: string; col: number; row: number; name: string }[];
  /** 被涂白的格子（边界墙），格式 "col,row" */
  painted: string[];
  zones: { id: string; cells: string[]; color: string; label: string }[];
}

export interface CombatDeltaPayload {
  v: 1;
  recordId: string;
  title: string;
  /** 广播时刻（DM 端时钟，毫秒），仅用于展示排序 */
  at: number;
  /** 参战者观战投影：只含观战字段，无背包/属性/装备变更等隐私与冗余 */
  roster: CombatRosterEntry[];
  /** 当前回合；模拟模式或未开始放映时为 null */
  turn: CombatTurnState | null;
  /** 沙盘投影；DM 未建沙盘时为 null */
  board: BoardProjection | null;
}
