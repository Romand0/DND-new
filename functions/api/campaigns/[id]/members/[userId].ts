// 成员角色变更与移出
// PATCH  /api/campaigns/[id]/members/[userId]   body {role: 'dm'|'player'}（DM 或站点管理员）
// DELETE /api/campaigns/[id]/members/[userId]   移出成员（DM 或站点管理员）

import { authenticateRequest, errorResponse, getCampaignContext, jsonResponse, readJsonBody } from '../../../../_utils';

type Ctx = { request: Request; env: { DB: D1Database }; params: { id: string; userId: string } };

async function requireDm(ctx: Ctx) {
  const auth = await authenticateRequest(ctx.request, ctx.env);
  if (!auth) return { error: errorResponse(401, '未登录') } as const;
  const campaign = await getCampaignContext(ctx.request, ctx.env, auth);
  if (!campaign || campaign.campaignId !== ctx.params.id) {
    return { error: errorResponse(403, '非该团组成员') } as const;
  }
  if (!auth.isAdmin && campaign.role !== 'dm') {
    return { error: errorResponse(403, '仅团组 DM 可管理成员') } as const;
  }
  return { auth } as const;
}

export async function onRequestPatch(context: Ctx) {
  const { request, env, params } = context;
  const guard = await requireDm(context);
  if ('error' in guard) return guard.error;

  const body = await readJsonBody<{ role?: string }>(request);
  const role = body?.role;
  if (role !== 'dm' && role !== 'player') return errorResponse(400, '角色必须为 dm 或 player');

  const result = await env.DB
    .prepare('UPDATE campaign_members SET role = ? WHERE campaign_id = ? AND user_id = ?')
    .bind(role, params.id, params.userId)
    .run();
  if (!result.meta.changes) return errorResponse(404, '成员不存在');
  return jsonResponse({ ok: true, role });
}

export async function onRequestDelete(context: Ctx) {
  const { env, params } = context;
  const guard = await requireDm(context);
  if ('error' in guard) return guard.error;

  const result = await env.DB
    .prepare('DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?')
    .bind(params.id, params.userId)
    .run();
  if (!result.meta.changes) return errorResponse(404, '成员不存在');
  return jsonResponse({ ok: true });
}
