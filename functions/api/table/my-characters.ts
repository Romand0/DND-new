// 查当前账号绑定的角色卡（玩家端确定「我的角色」集合）
// 权限：JWT（登录账号自身）
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, type Env } from '../../_utils';

interface EnvWithDb extends Env {
  DB: D1Database;
}

export async function onRequestGet(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);

  const result = await env.DB
    .prepare(
      `SELECT uc.character_id, c.name, c.class, c.level, c.race, c.current_hp, c.max_hp
       FROM user_characters uc
       JOIN characters c ON c.id = uc.character_id
       WHERE uc.user_id = ?
       ORDER BY uc.created_at ASC`
    )
    .bind(auth.sub)
    .all<any>();

  const characters = (result.results ?? []).map((row: any) => ({
    id: row.character_id,
    name: row.name ?? '未命名',
    class: row.class ?? '',
    level: row.level ?? 1,
    race: row.race ?? '',
    currentHp: row.current_hp ?? 0,
    maxHp: row.max_hp ?? 0,
  }));

  return jsonResponse({ characters });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
