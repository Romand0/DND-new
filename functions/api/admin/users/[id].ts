// functions/api/admin/users/[id].ts
// 账号管理：修改站点管理员/游戏身份（PATCH） / 删除账号（DELETE），需要站点管理员权限
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody } from '../../../_utils';

interface Env {
  DB: D1Database;
  DM_TOKEN: string;
  JWT_SECRET: string;
}

export async function onRequestPatch(context: any): Promise<Response> {
  const { request, env } = context;
  const id = context.params?.id as string;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, '未登录或凭证无效');
  }
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }

  const body = await readJsonBody<{ role?: string; isAdmin?: boolean }>(request);
  const wantsRole = body?.role !== undefined;
  const wantsAdmin = body?.isAdmin !== undefined;
  if (!body || (!wantsRole && !wantsAdmin)) {
    return errorResponse(400, '没有需要更新的字段');
  }
  if (wantsRole && body.role !== 'player' && body.role !== 'dm') {
    return errorResponse(400, '无效的游戏身份，仅支持 player 或 dm');
  }
  if (wantsAdmin && typeof body.isAdmin !== 'boolean') {
    return errorResponse(400, 'isAdmin 必须是布尔值');
  }
  // 防止管理员误操作把自己降权后无人可管理
  if (wantsAdmin && body.isAdmin === false && id === auth.sub) {
    return errorResponse(400, '不能取消自己的管理员权限');
  }

  try {
    const user = await env.DB.prepare('SELECT id, username FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string; username: string }>();
    if (!user) {
      return errorResponse(404, '账号不存在');
    }

    const sets: string[] = [];
    const binds: unknown[] = [];
    if (wantsRole) {
      sets.push('role = ?');
      binds.push(body.role);
    }
    if (wantsAdmin) {
      sets.push('is_admin = ?');
      binds.push(body.isAdmin ? 1 : 0);
    }
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds, id)
      .run();
    // 权限变更后强制该账号重新登录，保证前端状态与库内一致
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();

    return jsonResponse({ ok: true });
  } catch (e: any) {
    const msg = e?.message || '';
    if (/no such column/i.test(msg)) {
      return errorResponse(500, '数据库缺少 is_admin 字段，请先执行 migrations/0009_site_admin.sql');
    }
    return errorResponse(msg || '更新失败', 500);
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env } = context;
  const id = context.params?.id as string;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, '未登录或凭证无效');
  }
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }
  if (id === auth.sub) {
    return errorResponse(400, '不能删除自己的账号');
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
