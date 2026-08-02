// functions/api/auth/change-password.ts
// 修改密码：验证原密码 → 更新哈希 → 清空会话（强制重新登录）
import { jsonResponse, errorResponse, handleOptions, verifyJwt, readJsonBody, verifyPassword, hashPassword } from '../../_utils';

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

  const body = await readJsonBody<{ oldPassword?: string; newPassword?: string }>(request);
  if (!body || typeof body.oldPassword !== 'string' || typeof body.newPassword !== 'string') {
    return errorResponse(400, '请输入原密码和新密码');
  }
  if (body.newPassword.length < 6) {
    return errorResponse(400, '新密码长度至少 6 位');
  }

  try {
    const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(payload.sub)
      .first<{ password_hash: string }>();
    if (!user) {
      return errorResponse(404, 'User not found');
    }

    const isValid = await verifyPassword(body.oldPassword, user.password_hash);
    if (!isValid) {
      return errorResponse(401, '原密码错误');
    }

    const newHash = await hashPassword(body.newPassword);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, payload.sub),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(payload.sub),
    ]);

    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '修改密码失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
