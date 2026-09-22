// functions/api/admin/users/[id]/characters/index.ts
// 账号角色绑定：POST 绑定一个角色卡，仅接受 DM_TOKEN 认证
import { jsonResponse, errorResponse, handleOptions, verifyDmToken, readJsonBody, now } from '../../../../../_utils';

interface Env {
  DB: D1Database;
  DM_TOKEN: string;
}

// 每个玩家账号最多绑定的角色数量
const MAX_BOUND_CHARACTERS = 3;

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

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const id = context.params?.id as string;

  if (!verifyDmToken(request, env)) {
    return errorResponse(401, 'DM Token 无效');
  }

  const body = await readJsonBody<{ characterId?: string }>(request);
  if (!body || typeof body.characterId !== 'string' || !body.characterId) {
    return errorResponse(400, '缺少 characterId');
  }

  try {
    const user = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
      .bind(id)
      .first<{ id: string; role: string }>();
    if (!user) {
      return errorResponse(404, '账号不存在');
    }

    const character = await env.DB.prepare('SELECT id FROM characters WHERE id = ?')
      .bind(body.characterId)
      .first<{ id: string }>();
    if (!character) {
      return errorResponse(404, '角色不存在');
    }

    // 绑定上限仅对 player 生效
    if (user.role === 'player') {
      const countRow = await env.DB
        .prepare('SELECT COUNT(*) AS count FROM user_characters WHERE user_id = ?')
        .bind(id)
        .first<{ count: number }>();
      if ((countRow?.count ?? 0) >= MAX_BOUND_CHARACTERS) {
        return errorResponse(400, `每个玩家最多绑定 ${MAX_BOUND_CHARACTERS} 个角色`);
      }
    }

    await env.DB
      .prepare('INSERT OR IGNORE INTO user_characters (user_id, character_id, created_at) VALUES (?, ?, ?)')
      .bind(id, body.characterId, now())
      .run();

    return jsonResponse({ ok: true, characters: await fetchBoundCharacters(env, id) });
  } catch (e: any) {
    return errorResponse(e.message || '绑定失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
