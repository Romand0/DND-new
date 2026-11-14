// 实时房间协议类型（前端侧镜像）
// 与 realtime/src/index.ts 的 ClientMessage / ServerMessage 保持同步——改协议时两处一起改。
// 前端不 import realtime 源码，避免 Workers 类型（DurableObjectState 等）进入浏览器构建。
// DO 端对 delta 载荷只透传（Record<string, unknown>），events 等扩展字段无需在 Worker 侧镜像。
import type { CombatEvent } from './combat';

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
// player.action（玩家回合操作批提交）
// ======================
// 玩家在自己回合内本地执行操作，回合结束打包变更集提交；DM 端审核（前期）或
// 直接应用（后期）。DO 对 request 透传广播（不持久化、不进 deltas——瞬时请求，
// 断线由玩家重发）；result 是 DM 的广播回执（全房可见，桌面公开语义）。
// DO 端 action 保持 {kind:string} 透传不耦合协议演进；本文件是两端精确类型。

export interface TurnCommitAttackDamage {
  /** 伤害意图总量（玩家掷骰汇总；抗性减免由 DM 端落库时裁决） */
  amount: number;
  /** 伤害类型（火/挥砍/穿刺…），DM 端抗性判定用 */
  type: string;
  /** 骰组原文（如 2d6+3），审核卡展示用 */
  diceText?: string;
}

export type TurnCommitOp =
  | {
      kind: 'attack';
      /** 手持武器实例 ID（战斗背包 childId；null = 徒手） */
      weaponChildId: string | null;
      weaponName: string;
      targetId: string;
      targetName: string;
      /** 玩家掷的 d20 骰面（1-20） */
      d20: number;
      /** 玩家端攻击加值（展示与判定用） */
      bonus: number;
      /** 玩家端判定：d20 + bonus >= 目标 AC；d20=20 恒暴击 */
      hit: boolean;
      critical: boolean;
      /** 伤害意图；未命中为 null */
      damage: TurnCommitAttackDamage | null;
      /** 弹药实例 ID 与消耗发数（弹药武器才有） */
      ammoChildId?: string;
      ammoCount?: number;
      /** 远程武器（飞矢动画判定用；缺省近战） */
      ranged?: boolean;
      /** 写入先攻表格的行动文本 */
      roundText: string;
    }
  | {
      kind: 'move';
      /** 落点格子（切比雪夫网格坐标）；起点由 DM 端沙盘当前位置得出 */
      to: { col: number; row: number };
      roundText: string;
    }
  | {
      kind: 'cast';
      spellId: string;
      spellName: string;
      /** 消耗的法术位环阶；0 = 戏法（不消耗法术位） */
      slotLevel: number;
      targetId?: string;
      targetName?: string;
      /** 专注类法术：DM 端进入专注状态 */
      concentration?: boolean;
      /** 施法时间动作消耗（玩家端按 castingTime 预判；null = 长施法/仪式，不扣动作） */
      actionCost: 'action' | 'bonus' | null;
      roundText: string;
    }
  | {
      kind: 'note';
      roundText: string;
      /** 声明动作消耗：DM 端按此扣动作；null = 不消耗（自由动作/交流） */
      actionCost?: 'action' | 'bonus' | null;
    }
  | {
      kind: 'ready-item';
      slot: 'left' | 'right';
      /** 战斗背包实例 ID；null = 放下该手 */
      childId: string | null;
      itemName: string | null;
      roundText: string;
    }
  | {
      kind: 'hand-state';
      slot: 'left' | 'right';
      state: 'ready' | 'action' | 'unavailable';
      roundText: string;
    }
  | {
      kind: 'spell-slot';
      /** 环阶（1-9；0 不使用） */
      level: number;
      /** true=消耗一个环位，false=恢复一个环位 */
      consume: boolean;
      roundText: string;
    }
  | {
      kind: 'stop-concentration';
      roundText: string;
    }
  | {
      kind: 'dash';
      roundText: string;
    }
  | { kind: 'end-turn' };

export interface TurnCommitPayload {
  /** 操作序列（玩家实际执行顺序；未来动画按此重放） */
  ops: TurnCommitOp[];
}

export interface PlayerActionRequest {
  /** 玩家端生成的请求 ID（uuid），回执与重发去重用 */
  requestId: string;
  /** 提交时的放映轮次，DM 端校验与当前轮一致（防重连重放过期请求） */
  round: number;
  /** 发起操作的目标参战者（必须是对应玩家绑定角色的 PC） */
  combatantId: string;
  /** 玩家提交时最后收到的 combat.delta seq，DM 端比对当前 seq 检测过期状态 */
  baseSeq: number;
  action: TurnCommitPayload;
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
  /** 战斗速度（尺，含种族/装备修正前的基准）；0/缺省 = 不追踪移动力 */
  speed?: number;
  /** 速度修正（尺） */
  speedModifier?: number;
  /** 本回合已消耗移动力（尺） */
  movementUsed?: number;
  /** 疾走获得的额外移动力（尺） */
  dashExtraMovement?: number;
  concentration?: { spellName: string; startedRound: number } | null;
  deathSaves?: { failures: number; successes: number } | null;
  /** 回合待办摘要（该参战者相关的持续效果提醒） */
  todos?: RosterTurnTodo[];
  /** PC 战斗背包投影（武器/弹药/物品 + 攻击属性快照；NPC 为 null）。
   *  真实桌面玩家互相可见装备，属接受的公开语义；无价格/描述/背包外字段。 */
  inventory?: RosterInventoryItem[] | null;
  /** PC 战斗法术位视图（角色卡法术位 + 战斗消耗漏斗后的真实可用数；NPC 或无法术位为 null） */
  spellSlots?: RosterSpellSlot[] | null;
  /** PC 主动技能（角色卡 features 按作用方式派生；NPC 为 null） */
  activeFeatures?: { name: string; description: string }[] | null;
  /** PC 可施法术列表（角色卡法术名解析模板库所得；NPC 或无法术为 null） */
  spells?: RosterSpellEntry[] | null;
}

/** 战斗法术投影条目（玩家施法表单所需最小集） */
export interface RosterSpellEntry {
  id: string;
  name: string;
  level: number;
  castingTime: string;
  concentration?: boolean;
  damageType?: string;
}

/** 战斗中法术位视图条目（used/max 为漏斗后实时值） */
export interface RosterSpellSlot {
  level: number;
  label: string;
  used: number;
  max: number;
}

/** 战斗背包物品投影的攻击属性快照（角色卡 attacks 按武器名匹配所得） */
export interface RosterInventoryAttack {
  damage: string;
  damageType: string;
  properties: string[];
  /** 近战/远程类目（Ranged = 远程武器） */
  subtype?: string;
  normalRange?: number;
  maxRange?: number;
  /** 多用属性双手伤害骰 */
  twoHandedDamage?: string;
  /** 装填属性：当前弹匣状态 */
  loaded?: boolean;
}

export interface RosterInventoryItem {
  /** 战斗背包实例 ID（= Equipment.childId || id） */
  childId: string;
  name: string;
  quantity: number;
  /** 装备类目（武器/防具/弹药/杂项…），背包分页分组显示用 */
  category?: string;
  /** 魔法加值（+1/+2/+3 武器），玩家端攻击加值计算用 */
  magicBonus?: number;
  /** 武器攻击属性；弹药/普通物品为 null */
  attack: RosterInventoryAttack | null;
}

export interface CombatTurnState {
  round: number;
  combatantId: string | null;
  playback: boolean;
  /** 放映已暂停（资源不生效；玩家端据此刻画 HUD 与移动范围） */
  paused?: boolean;
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
  /** 战斗事件流（最近 50 条）：驱动回合摘要与动画；玩家端按 id 去重增量播放 */
  events?: CombatEvent[];
}
