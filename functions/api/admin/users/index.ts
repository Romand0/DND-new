// functions/api/admin/users/index.ts
// 账号管理列表：仅接受 DM_TOKEN 认证
import { jsonResponse, errorResponse, handleOptions, verifyDmToken } from '../../../_utils';

interface Env {
  DB: D1Database;
  DM_TOKEN: string;
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  if (!verifyDmToken(request, env)) {
    return errorResponse(401, 'DM Token 无效');
  }

  try {
    const nowMs = Date.now();
    const result = await env.DB
      .prepare(
        `SELECT u.id, u.username, u.role, u.created_at,
                (s.exp IS NOT NULL AND s.exp > ?1) AS online
         FROM users u
         LEFT JOIN sessions s ON s.user_id = u.id
         ORDER BY u.created_at ASC`
      )
      .bind(nowMs)
      .all();

    // 已绑定的角色卡：LEFT JOIN 保留已被删除角色的悬空绑定（name 为 null）
    const bindResult = await env.DB
      .prepare(
        `SELECT uc.user_id, uc.character_id, c.name, c.class, c.level, c.race
         FROM user_characters uc
         LEFT JOIN characters c ON c.id = uc.character_id
         ORDER BY uc.created_at ASC`
      )
      .all();

    const boundByUser = new Map<string, any[]>();
    for (const row of bindResult.results as any[]) {
      const list = boundByUser.get(row.user_id) || [];
      list.push({
        id: row.character_id,
        name: row.name ?? null,
        class: row.class ?? '',
        level: row.level ?? 1,
        race: row.race ?? '',
      });
      boundByUser.set(row.user_id, list);
    }

    const users = (result.results as any[]).map((row: any) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      online: row.online === 1,
      characters: boundByUser.get(row.id) || [],
    }));
    return jsonResponse({ users });
  } catch (e: any) {
    return errorResponse(e.message || '数据库查询失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
