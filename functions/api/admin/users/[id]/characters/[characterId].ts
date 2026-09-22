// functions/api/admin/users/[id]/characters/[characterId].ts
// 账号角色绑定：DELETE 解绑一个角色卡，仅接受 DM_TOKEN 认证
import { jsonResponse, errorResponse, handleOptions, verifyDmToken } from '../../../../../_utils';

interface Env {
  DB: D1Database;
  DM_TOKEN: string;
}

// 查询某账号绑定的角色卡（LEFT JOIN 保留已删除角色的悬空绑定）
async function fetchBoundCharacters(env: Env, userId: string): Promise<any[]> {
  const result = await env.DB
    .prepare(
      `SELECT uc.character_id, c.name, c.class, c.level, c.race
       FROM user_characters uc
       LEFT JOIN characters c ON c.id = uc.character_id
       WHERE uc.user_id = ?
       ORDER BY uc.created_at ASC`
    )
    .bind(userId)
    .all();
  return (result.results as any[]).map((row: any) => ({
    id: row.character_id,
    name: row.name ?? null,
    class: row.class ?? '',
    level: row.level ?? 1,
    race: row.race ?? '',
  }));
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env } = context;
  const id = context.params?.id as string;
  const characterId = context.params?.characterId as string;

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

    await env.DB
      .prepare('DELETE FROM user_characters WHERE user_id = ? AND character_id = ?')
      .bind(id, characterId)
      .run();

    return jsonResponse({ ok: true, characters: await fetchBoundCharacters(env, id) });
  } catch (e: any) {
    return errorResponse(e.message || '解绑失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
