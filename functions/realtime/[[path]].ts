// /realtime WebSocket 桥接：玩家设备连主站域名（国内可达），主站 Functions 转发到实时 DO。
// 背景：实时 Worker 的 *.workers.dev 域名在大陆被阻断，客户端直连会 1006。
// 双路转发（按可用性自动选择）：
//   1. 跨服务 DO binding（wrangler.toml COMBAT_ROOM → script dnd-realtime）：直连 DO，CF 内网
//   2. REALTIME_WORKER_URL 反代（Pages variable，Worker 公网地址）：边缘互访，同样不经过国内网络
//     ——Pages 对跨服务 DO binding 的支持存在不确定性，反代是兜底通路
// 鉴权：复用 JWT + 查库（authenticateRequest）；token 由 WS 客户端放 query（握手无法自定义头）。
// /realtime/health 诊断端点：返回两路可用状态，浏览器直接访问即可定位部署问题。
import { authenticateRequest } from '../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  // Pages wrangler.toml [[durable_objects.bindings]] script_name = "dnd-realtime"（若 Pages 支持）
  COMBAT_ROOM?: DurableObjectNamespace;
  // 兜底反代目标（Pages variable，运行时注入），如 https://dnd-realtime.<account>.workers.dev
  REALTIME_WORKER_URL?: string;
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);

  // 诊断端点：非 WS，浏览器直接开 https://<站点>/realtime/health
  if (url.pathname === '/realtime/health') {
    const viaBinding = !!env.COMBAT_ROOM;
    const viaProxy = !!env.REALTIME_WORKER_URL;
    return new Response(
      JSON.stringify({
        ok: viaBinding || viaProxy,
        binding: viaBinding,
        proxy: viaProxy,
        hint: viaBinding || viaProxy ? 'bridge ready' : 'set REALTIME_WORKER_URL variable on Pages project',
      }),
      { headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  const match = url.pathname.match(/^\/realtime\/room\/([A-Za-z0-9_-]{1,64})$/);
  if (!match) return new Response('not found', { status: 404 });
  const roomId = match[1];

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket upgrade', { status: 426 });
  }

  const token = url.searchParams.get('token') || '';
  const auth = await authenticateRequest(
    new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }),
    env,
  );
  if (!auth) {
    // 与 Worker 入口同语义：认证失败统一 401（浏览器侧表现为 1006）
    return new Response('unauthorized', { status: 401 });
  }

  // 通路 1：跨服务 binding 直连 DO（CF 内网，不经公网）
  if (env.COMBAT_ROOM) {
    const headers = new Headers(request.headers);
    headers.set('x-user-id', auth.sub);
    headers.set('x-user-role', auth.role);
    headers.set('x-room-id', roomId);
    const id = env.COMBAT_ROOM.idFromName(roomId);
    return env.COMBAT_ROOM.get(id).fetch(new Request(request.url, { method: 'GET', headers }));
  }

  // 通路 2：反代到 Worker 公网地址（CF 边缘互访，玩家设备无需解析 workers.dev）
  if (env.REALTIME_WORKER_URL) {
    const base = env.REALTIME_WORKER_URL.replace(/\/+$/, '');
    const upstream = `${base}/room/${roomId}?token=${encodeURIComponent(token)}`;
    return fetch(upstream, { method: 'GET', headers: request.headers });
  }

  return new Response('realtime bridge not configured', { status: 503 });
}
