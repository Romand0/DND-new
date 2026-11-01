// 团组成员列表
// GET /api/campaigns/[id]/members   成员可见（含账号名）

import { authenticateRequest, errorResponse, getCampaignContext, jsonResponse } from '../../../../_utils';

export async function onRequestGet(context: { request: Request; env: { DB: D1Database }; params: { id: string } }) {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录');

  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || ctx.campaignId !== params.id) return errorResponse(403, '非该团组成员');

  const { results } = await env.DB
    .prepare(
      `SELECT m.user_id, m.role, m.joined_at, u.username, u.avatar
       FROM campaign_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.campaign_id = ?
       ORDER BY m.joined_at ASC`
    )
    .bind(params.id)
    .all<{ user_id: string; role: string; joined_at: number; username: string | null; avatar: string | null }>();

  return jsonResponse(
    results.map((r) => ({
      userId: r.user_id,
      role: r.role,
      joinedAt: r.joined_at,
      username: r.username || '未知账号',
      avatar: r.avatar || '',
    }))
  );
}
