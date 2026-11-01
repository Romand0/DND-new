// 重置团组邀请码
// POST /api/campaigns/[id]/invite   DM 或站点管理员 → 返回新邀请码

import { authenticateRequest, errorResponse, getCampaignContext, jsonResponse, now } from '../../../_utils';

export async function onRequestPost(context: { request: Request; env: { DB: D1Database }; params: { id: string } }) {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录');

  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || ctx.campaignId !== params.id) return errorResponse(403, '非该团组成员');
  if (!auth.isAdmin && ctx.role !== 'dm') return errorResponse(403, '仅团组 DM 可重置邀请码');

  const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const result = await env.DB
    .prepare('UPDATE campaigns SET invite_code = ? WHERE id = ?')
    .bind(inviteCode, params.id)
    .run();
  if (!result.meta.changes) return errorResponse(404, '团组不存在');
  return jsonResponse({ inviteCode, rotatedAt: now() });
}
