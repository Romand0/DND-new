// functions/api/auth/me.ts
import { jsonResponse, errorResponse, verifyJwt, readJsonBody } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

interface JwtPayload {
  sub: string;
  role: string;
}

// 从 Authorization 头解析 JWT，返回 payload 或 null
async function resolveUser(request: Request, env: Env): Promise<JwtPayload | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    return await verifyJwt(token, jwtSecret);
  } catch {
    return null;
  }
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  const payload = await resolveUser(request, env);
  if (!payload) {
    return errorResponse(401, 'Invalid or expired token');
  }

  // 从数据库查询用户
  const user = await env.DB.prepare(
    'SELECT id, username, role, avatar, created_at FROM users WHERE id = ?'
  )
    .bind(payload.sub)
    .first<{ id: string; username: string; role: string; avatar: string | null; created_at: number }>();

  if (!user) {
    return errorResponse(404, 'User not found');
  }

  // 返回用户信息
  return jsonResponse({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      avatar: user.avatar || null,
    },
  });
}

export async function onRequestPatch(context: any): Promise<Response> {
  const { request, env } = context;

  const payload = await resolveUser(request, env);
  if (!payload) {
    return errorResponse(401, 'Invalid or expired token');
  }

  const body = await readJsonBody<{ username?: string; avatar?: string }>(request);
  if (!body) {
    return errorResponse(400, 'Invalid JSON body');
  }
  const { username, avatar } = body;
  if ((!username && avatar === undefined) || (username !== undefined && typeof username !== 'string') || (avatar !== undefined && typeof avatar !== 'string')) {
    return errorResponse(400, '字段格式错误');
  }

  try {
    const current = await env.DB.prepare('SELECT id, username, role, avatar FROM users WHERE id = ?')
      .bind(payload.sub)
      .first<{ id: string; username: string; role: string; avatar: string | null }>();
    if (!current) {
      return errorResponse(404, 'User not found');
    }

    const finalUsername = username !== undefined ? username.trim() : current.username;
    const finalAvatar = avatar !== undefined ? avatar : current.avatar;

    // 用户名校验
    if (finalUsername.length < 2) {
      return errorResponse(400, '用户名至少 2 个字符');
    }
    if (finalUsername !== current.username) {
      const dup = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .bind(finalUsername, payload.sub)
        .first();
      if (dup) {
        return errorResponse(400, '用户名已被占用');
      }
    }

    // 头像校验：仅允许 http(s) 或 data:image base64，防止脚本注入
    if (finalAvatar && !/^(https?:\/\/|data:image\/)/.test(finalAvatar)) {
      return errorResponse(400, '头像地址格式错误');
    }
    if (finalAvatar && finalAvatar.length > 800_000) {
      return errorResponse(400, '头像数据过大');
    }

    await env.DB.prepare('UPDATE users SET username = ?, avatar = ? WHERE id = ?')
      .bind(finalUsername, finalAvatar || null, payload.sub)
      .run();

    return jsonResponse({
      user: {
        id: current.id,
        username: finalUsername,
        role: current.role,
        avatar: finalAvatar || null,
      },
    });
  } catch (e: any) {
    return errorResponse(500, e.message || '更新失败');
  }
}
