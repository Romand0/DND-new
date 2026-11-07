// 战斗房间 Durable Object（实时层最小骨架）
// 职责：WS 连接管理 + 成员广播 + 增量消息持久化（SQLite）+ 迟到者补发
// 设计原则：D1 是持久真相，DO 只持实时视图；本对象不写 D1，由调用方（DM 客户端）负责战后归档。
import { verifyJwt } from './jwt';
import { SPIKE_HTML } from './spikePage';

export interface Env {
  COMBAT_ROOM: DurableObjectNamespace;
  JWT_SECRET?: string;
  /** 仅本地开发：ALLOW_DEV_TOKEN=1 时接受 token=dev 直连（勿在生产开启） */
  ALLOW_DEV_TOKEN?: string;
}

/** 协议 v0：客户端 → 房间 */
export type ClientMessage =
  | { t: 'ping' }
  | { t: 'echo'; payload: unknown }
  | { t: 'snapshot.request' }
  | { t: 'combat.delta'; payload: unknown };

/** 协议 v0：房间 → 客户端 */
export type ServerMessage =
  | { t: 'welcome'; clientId: string; userId: string; role: string; roomId: string; seq: number; members: SessionMeta[] }
  | { t: 'members'; members: SessionMeta[] }
  | { t: 'pong'; at: number }
  | { t: 'echo'; payload: unknown; from: SessionMeta }
  | { t: 'combat.delta'; seq: number; payload: unknown; from: SessionMeta; at: number }
  | { t: 'snapshot'; seq: number; deltas: { seq: number; payload: unknown; at: number }[] }
  | { t: 'error'; message: string };

export interface SessionMeta {
  clientId: string;
  userId: string;
  role: string;
  joinedAt: number;
}

const MAX_PERSISTED_DELTAS = 200;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    }

    // JWT 验签诊断：浏览器直接开 /diag?token=xxx 看 JSON 结果（spike 1006 排障用）
    if (url.pathname === '/diag') {
      const token = url.searchParams.get('token') || '';
      let body: Record<string, unknown>;
      if (!env.JWT_SECRET) {
        body = { ok: false, reason: 'JWT_SECRET not set on this Worker' };
      } else if (!token) {
        body = { ok: false, reason: 'no token in query' };
      } else {
        try {
          const payload = await verifyJwt(token, env.JWT_SECRET);
          body = { ok: true, sub: payload.sub, role: payload.role };
        } catch (e) {
          body = { ok: false, reason: e instanceof Error ? e.message : String(e) };
        }
      }
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // 自包含的 WS 测试页（spike 验证用，生产也可保留，仅做连通性诊断）
    if (url.pathname === '/' || url.pathname === '/spike') {
      return new Response(SPIKE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})$/);
    if (!match) return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    // 认证：生产验 JWT；本地可用 ALLOW_DEV_TOKEN=1 + token=dev 旁路
    const token = url.searchParams.get('token') || '';
    let identity: { userId: string; role: string };
    try {
      if (env.ALLOW_DEV_TOKEN === '1' && token === 'dev') {
        identity = { userId: 'dev-user', role: url.searchParams.get('role') === 'dm' ? 'dm' : 'player' };
      } else {
        const payload = await verifyJwt(token, env.JWT_SECRET || '');
        identity = { userId: payload.sub, role: payload.role || 'player' };
      }
    } catch (e) {
      // 1006 排障：把验签失败原因打进实时日志（signature/expired/malformed）
      console.warn('[auth] reject:', e instanceof Error ? e.message : String(e));
      return new Response('unauthorized', { status: 401 });
    }

    const headers = new Headers(request.headers);
    headers.set('x-user-id', identity.userId);
    headers.set('x-user-role', identity.role);
    headers.set('x-room-id', match[1]);

    const id = env.COMBAT_ROOM.idFromName(match[1]);
    return env.COMBAT_ROOM.get(id).fetch(new Request(request.url, { method: 'GET', headers }));
  },
};

export class CombatRoomDO implements DurableObject {
  private ctx: DurableObjectState;
  private sql: SqlStorage;
  private seq = 0;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS deltas (
        seq INTEGER PRIMARY KEY,
        payload TEXT NOT NULL,
        at INTEGER NOT NULL
      )`);
      const row = [...this.sql.exec<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM deltas')][0];
      this.seq = row?.seq ?? 0;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const meta: SessionMeta = {
      clientId: crypto.randomUUID(),
      userId: request.headers.get('x-user-id') || 'unknown',
      role: request.headers.get('x-user-role') || 'player',
      joinedAt: Date.now(),
    };

    // Hibernation API：空闲时 DO 休眠、连接不断、不计活跃时长
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(meta);

    const roomId = request.headers.get('x-room-id') || '';
    this.send(server, { t: 'welcome', ...meta, roomId, seq: this.seq, members: this.members() });
    this.broadcast({ t: 'members', members: this.members() });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const meta = this.metaOf(ws);
    if (!meta) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      this.send(ws, { t: 'error', message: 'invalid json' });
      return;
    }

    switch (msg.t) {
      case 'ping':
        this.send(ws, { t: 'pong', at: Date.now() });
        return;

      case 'echo':
        this.broadcast({ t: 'echo', payload: msg.payload, from: meta });
        return;

      case 'snapshot.request': {
        const rows = [...this.sql.exec<{ seq: number; payload: string; at: number }>(
          'SELECT seq, payload, at FROM deltas ORDER BY seq DESC LIMIT 50',
        )].reverse();
        this.send(ws, {
          t: 'snapshot',
          seq: this.seq,
          deltas: rows.map((r) => ({ seq: r.seq, payload: JSON.parse(r.payload), at: r.at })),
        });
        return;
      }

      case 'combat.delta': {
        // 权威写入仅限 DM
        if (meta.role !== 'dm') {
          this.send(ws, { t: 'error', message: 'only dm can write combat.delta' });
          return;
        }
        const seq = ++this.seq;
        const at = Date.now();
        this.sql.exec('INSERT INTO deltas (seq, payload, at) VALUES (?, ?, ?)', seq, JSON.stringify(msg.payload), at);
        this.sql.exec('DELETE FROM deltas WHERE seq <= ?', seq - MAX_PERSISTED_DELTAS);
        this.broadcast({ t: 'combat.delta', seq, payload: msg.payload, from: meta, at });
        return;
      }

      default:
        this.send(ws, { t: 'error', message: 'unknown message type' });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // 已关闭
    }
    this.broadcast({ t: 'members', members: this.members() });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // 已关闭
    }
  }

  private members(): SessionMeta[] {
    const list: SessionMeta[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const meta = this.metaOf(ws);
      if (meta) list.push(meta);
    }
    return list;
  }

  private metaOf(ws: WebSocket): SessionMeta | null {
    try {
      return (ws.deserializeAttachment() as SessionMeta | null) ?? null;
    } catch {
      return null;
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // 连接已断开，忽略
    }
  }

  private broadcast(msg: ServerMessage): void {
    const raw = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(raw);
      } catch {
        // 单连接失败不影响其余
      }
    }
  }
}
