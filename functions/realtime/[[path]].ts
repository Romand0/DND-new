// /realtime/room/<roomId> WebSocket 桥接：
// players.dev 主站域名国内可达，而实时 Worker 的 *.workers.dev 域名被阻断——
// 玩家端不挂代理连不上 Worker。此 Function 在主站域名下承接 WS upgrade，
// 复用 wrangler.toml 的跨服务 DO binding（COMBAT_ROOM → script dnd-realtime）
// 直连 Durable Object（CF 内网，不经公网），鉴权复用 JWT + 查库。
// 客户端默认连 wss://<站点域名>/realtime/room/...（combatRoomClient 的缺省路径），无需任何配置。
import { authenticateRequest } from '../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  // Pages wrangler.toml [[durable_objects.bindings]] script_name = "dnd-realtime"
  COMBAT_ROOM: DurableObjectNamespace;
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket upgrade', { status: 426 });
  }

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/realtime\/room\/([A-Za-z0-9_-]{1,64})$/);
  if (!match) return new Response('not found', { status: 404 });
  const roomId = match[1];

  // 客户端把 token 放在 query（WS 无法自定义握手头），转成 Authorization 供统一鉴权
  const token = url.searchParams.get('token') || '';
  const auth = await authenticateRequest(
    new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }),
    env,
  );
  if (!auth) {
    // 与 Worker 入口同语义：认证失败统一 401（浏览器侧表现为 1006）
    return new Response('unauthorized', { status: 401 });
  }

  // 透传 upgrade + 身份头直连 DO（DO 的 fetch 只看 Upgrade 与身份头）
  const headers = new Headers(request.headers);
  headers.set('x-user-id', auth.sub);
  headers.set('x-user-role', auth.role);
  headers.set('x-room-id', roomId);

  const id = env.COMBAT_ROOM.idFromName(roomId);
  return env.COMBAT_ROOM.get(id).fetch(new Request(request.url, { method: 'GET', headers }));
}
