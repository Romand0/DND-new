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
  | { t: 'combat.delta'; payload: unknown };

export type ServerMessage =
  | { t: 'welcome'; clientId: string; userId: string; role: string; roomId: string; seq: number; members: SessionMeta[] }
  | { t: 'members'; members: SessionMeta[] }
  | { t: 'pong'; at: number }
  | { t: 'echo'; payload: unknown; from: SessionMeta }
  | { t: 'combat.delta'; seq: number; payload: unknown; from: SessionMeta; at: number }
  | { t: 'snapshot'; seq: number; deltas: { seq: number; payload: unknown; at: number }[] }
  | { t: 'error'; message: string };
