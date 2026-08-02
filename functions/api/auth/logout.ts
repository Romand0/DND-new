// functions/api/auth/logout.ts
// 退出登录：清除该账号的 session 记录，使账号一览页「在线」状态失效
import { jsonResponse, errorResponse, handleOptions, verifyJwt } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Invalid or expired token');
  }
  let payload: { sub: string; role: string };
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    payload = await verifyJwt(authHeader.slice(7), jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  try {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(payload.sub).run();
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '退出登录失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
