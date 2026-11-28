// 玩家当前所在观战房间：每人最多一场，没有则 room=null。
// 权限：JWT（只返回当前账号自己的状态）。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, type Env } from '../../_utils';

interface EnvWithDb extends Env {
  DB: D1Database;
}

export async function onRequestGet(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);

  const row = await env.DB
    .prepare(
      `SELECT room_id, title, campaign_id, from_user_id, created_at, updated_at
       FROM table_spectate_presence
       WHERE user_id = ?`
    )
    .bind(auth.sub)
    .first<{
      room_id: string;
      title: string;
      campaign_id: string | null;
      from_user_id: string;
      created_at: number;
      updated_at: number;
    }>();

  if (!row) return jsonResponse({ room: null });

  return jsonResponse({
    room: {
      roomId: row.room_id,
      title: row.title,
      campaignId: row.campaign_id,
      fromUserId: row.from_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
