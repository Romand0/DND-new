// functions/api/admin/users/[id]/password.ts
// 账号管理：重置密码（POST），仅接受 DM_TOKEN 认证
import { jsonResponse, errorResponse, handleOptions, verifyDmToken, readJsonBody, hashPassword } from '../../../../_utils';

interface Env {
  DB: D1Database;
  DM_TOKEN: string;
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const id = context.params?.id as string;

  if (!verifyDmToken(request, env)) {
    return errorResponse(401, 'DM Token 无效');
  }

  const body = await readJsonBody<{ password?: string }>(request);
  if (!body || typeof body.password !== 'string' || body.password.length < 6) {
    return errorResponse(400, '新密码长度至少 6 位');
  }

  try {
    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string }>();
    if (!user) {
      return errorResponse(404, '账号不存在');
    }

    const passwordHash = await hashPassword(body.password);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, id),
      // 密码已重置，强制该账号重新登录
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    ]);

    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(e.message || '重置密码失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
