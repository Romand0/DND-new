// 查已绑定玩家账号的角色卡（DM 发起表单的可选角色集合）
// 权限：JWT + isAdmin。返回角色卡 + 绑定账号名。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, type Env } from '../../_utils';

interface EnvWithDb extends Env {
  DB: D1Database;
}

export async function onRequestGet(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);
  if (!auth.isAdmin) return errorResponse('需要管理员权限', 403);

  const result = await env.DB
    .prepare(
      `SELECT uc.character_id, c.name, c.class, c.level, c.race, u.id AS bound_user_id, u.username AS bound_user_name
       FROM user_characters uc
       JOIN characters c ON c.id = uc.character_id
       JOIN users u ON u.id = uc.user_id
       GROUP BY uc.character_id
       ORDER BY c.name ASC`
    )
    .all<any>();

  const characters = (result.results ?? []).map((row: any) => ({
    id: row.character_id,
    name: row.name ?? '未命名',
    class: row.class ?? '',
    level: row.level ?? 1,
    race: row.race ?? '',
    boundUserId: row.bound_user_id ?? '',
    boundUserName: row.bound_user_name ?? '',
  }));

  return jsonResponse({ characters });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
