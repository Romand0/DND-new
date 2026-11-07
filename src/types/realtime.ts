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
  | { t: 'combat.delta'; payload: CombatDeltaPayload }
  | { t: 'player.action'; request: PlayerActionRequest }
  | { t: 'player.action.result'; result: PlayerActionResult };

export type ServerMessage =
  | { t: 'welcome'; v: string; clientId: string; userId: string; role: string; roomId: string; seq: number; members: SessionMeta[] }
  | { t: 'members'; members: SessionMeta[] }
  | { t: 'pong'; at: number }
  | { t: 'echo'; payload: unknown; from: SessionMeta }
  | { t: 'combat.delta'; seq: number; payload: CombatDeltaPayload; from: SessionMeta; at: number }
  | { t: 'snapshot'; seq: number; deltas: { seq: number; payload: unknown; at: number }[] }
  | { t: 'player.action'; request: PlayerActionRequest; from: SessionMeta; at: number }
  | { t: 'player.action.result'; result: PlayerActionResult; from: SessionMeta; at: number }
  | { t: 'error'; message: string };

// ======================
// player.action（玩家回合操作批提交，M1 通道）
// ======================
// 玩家在自己回合内本地执行操作，回合结束打包变更集提交；DM 端审核（前期）或
// 直接应用（后期）。DO 对 request 透传广播（不持久化、不进 deltas——瞬时请求，
// 断线由玩家重发）；result 是 DM 的广播回执（全房可见，桌面公开语义）。
// action 内容对 DO 不透明（透传 unknown），协议演进只涉及两端。

export interface PlayerActionRequest {
  /** 玩家端生成的请求 ID（uuid），回执与重发去重用 */
  requestId: string;
  /** 提交时的放映轮次，DM 端校验与当前轮一致（防重连重放过期请求） */
  round: number;
  /** 发起操作的目标参战者（必须是对应玩家绑定角色的 PC） */
  combatantId: string;
  /** 玩家提交时最后收到的 combat.delta seq，DM 端比对当前 seq 检测过期状态 */
  baseSeq: number;
  /** 回合变更集：M1 通道验证阶段为透传骨架，M2 定义 ops/effects 结构 */
  action: { kind: 'turn-commit' } & { ops?: unknown[]; effects?: unknown };
}

export interface PlayerActionResult {
  requestId: string;
  accepted: boolean;
  /** 拒绝原因（accepted=false 时给玩家端展示） */
  reason?: string;
}

// ======================
// combat.delta payload（v1）
// ======================
// 服务端（realtime Worker）对 payload 完全透传，不解析内容——协议演进只涉及 DM 发送方
// 与玩家接收方两端，此处是唯一事实源。payload 是「幂等快照」而非细粒度补丁：
// 每条消息自包含完整观战投影，接收方整体替换状态，无 diff/合并逻辑，断线重连
// （snapshot.request 补最近 delta）后直接取最后一条即恢复到最新。

export interface RosterHandInfo {
  name: string;
  /** ready 待用 / action 动作中 / unavailable 不可用 */
  state: string;
}

export interface RosterTurnTodo {
  name: string;
  typeLabel: string;
  executed: boolean;
}

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
  /** PC 关联角色卡 ID：玩家端配合「我的绑定角色」识别自身参战者 */
  characterId?: string | null;
  /** 战斗层手持（武器名已解析；仅公开桌面信息，无背包明细） */
  heldLeft?: RosterHandInfo | null;
  heldRight?: RosterHandInfo | null;
  /** 放映模式剩余动作（模拟模式数值无意义，玩家端按 turn.playback 显示） */
  actions?: number;
  bonusActions?: number;
  concentration?: { spellName: string; startedRound: number } | null;
  deathSaves?: { failures: number; successes: number } | null;
  /** 回合待办摘要（该参战者相关的持续效果提醒） */
  todos?: RosterTurnTodo[];
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

/** 先攻表格投影：数组下标即轮次（0 = 第 1 轮），每行是 { 参战者ID: 行动文本 }。
 *  行动文本与 DM 侧 InitiativeTable 格子同源（含「被突袭」占位），无隐私字段。 */
export type RoundsProjection = { [combatantId: string]: string }[];

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
  /** 先攻表格：仅在放映中（turn 非 null）随快照下发，非放映时空数组（玩家端据此清空） */
  rounds: RoundsProjection;
}
