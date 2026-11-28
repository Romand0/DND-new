// DM 当前投送中的战斗：按房间聚合仍在名单内的玩家数，不含历史投送。
// 权限：JWT + isAdmin；只返回当前 DM 自己投送的房间。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, type Env } from '../../_utils';

interface EnvWithDb extends Env {
  DB: D1Database;
}

export async function onRequestGet(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);
  if (!auth.isAdmin) return errorResponse('需要管理员权限', 403);

  const url = new URL(request.url);
  const campaignId = (url.searchParams.get('campaignId') || '').trim();

  const result = await env.DB
    .prepare(
      `SELECT room_id, title, campaign_id, COUNT(*) AS recipients, MAX(updated_at) AS updated_at
       FROM table_spectate_presence
       WHERE from_user_id = ? AND (? = '' OR campaign_id = ?)
       GROUP BY room_id, title, campaign_id
       ORDER BY updated_at DESC`
    )
    .bind(auth.sub, campaignId, campaignId)
    .all<{
      room_id: string;
      title: string;
      campaign_id: string | null;
      recipients: number;
      updated_at: number;
    }>();

  const rooms = (result.results ?? []).map((r) => ({
    roomId: r.room_id,
    title: r.title,
    campaignId: r.campaign_id,
    recipients: r.recipients,
    updatedAt: r.updated_at,
  }));

  return jsonResponse({ rooms });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
