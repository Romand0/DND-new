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

  // 注意：characters 表没有 current_hp/max_hp 列（HP 在 data JSON 里），引用不存在的列会让 D1 抛 500
  const result = await env.DB
    .prepare(
      `SELECT uc.character_id, c.name, c.class, c.level, c.race
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
  }));

  return jsonResponse({ characters });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
