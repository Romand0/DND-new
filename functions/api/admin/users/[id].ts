// functions/api/admin/users/[id].ts
// 账号管理：修改权限（PATCH） / 删除账号（DELETE），仅接受 DM_TOKEN 认证
import { jsonResponse, errorResponse, handleOptions, verifyDmToken, readJsonBody } from '../../../_utils';

interface Env {
  DB: D1Database;
  DM_TOKEN: string;
}

export async function onRequestPatch(context: any): Promise<Response> {
  const { request, env } = context;
  const id = context.params?.id as string;

  if (!verifyDmToken(request, env)) {
    return errorResponse(401, 'DM Token 无效');
  }

  const body = await readJsonBody<{ role?: string }>(request);
  if (!body || (body.role !== 'player' && body.role !== 'dm')) {
    return errorResponse(400, '无效的权限值，仅支持 player 或 dm');
  }

  try {
    const user = await env.DB.prepare('SELECT id, username FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string; username: string }>();
    if (!user) {
      return errorResponse(404, '账号不存在');
    }

    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?')
      .bind(body.role, id)
      .run();
    // role 存在 JWT 中，强制该账号重新登录使新权限生效
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();

    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(e.message || '更新失败', 500);
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env } = context;
  const id = context.params?.id as string;

  if (!verifyDmToken(request, env)) {
    return errorResponse(401, 'DM Token 无效');
  }

  try {
    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string }>();
    if (!user) {
      return errorResponse(404, '账号不存在');
    }

    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
    ]);

    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(e.message || '删除失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
