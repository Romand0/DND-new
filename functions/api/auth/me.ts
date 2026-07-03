// functions/api/auth/me.ts
import { errorResponse, verifyJwt } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return errorResponse(405, 'Method not allowed');
  }

  // 从 Authorization 头提取 Token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const token = authHeader.slice(7);

  // 验证 Token 并解析 payload（使用硬编码兜底，和 login.ts 保持一致）
  let payload: { sub: string; role: string };
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    payload = await verifyJwt(token, jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  // 从数据库查询用户
  const user = await env.DB.prepare(
    'SELECT id, username, role, created_at FROM users WHERE id = ?'
  )
    .bind(payload.sub)
    .first<{ id: string; username: string; role: string; created_at: number }>();

  if (!user) {
    return errorResponse(404, 'User not found');
  }

  // 返回用户信息
  return new Response(JSON.stringify({ user }), {
    headers: { 'Content-Type': 'application/json' },
  });
};


  if (!user) {
    return errorResponse(404, 'User not found');
  }

  // 返回用户信息
  return new Response(JSON.stringify({ user }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

