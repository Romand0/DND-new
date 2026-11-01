// 团组详情与更新
// GET   /api/campaigns/[id]   详情（成员可见；含我的角色与邀请码——邀请码仅 DM 视角有用，前端按角色显隐）
// PATCH /api/campaigns/[id]   更新名称/描述/规则书集（DM 或站点管理员）

import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  readJsonBody,
} from '../../_utils';

interface CampaignRow {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  rulebooks: string;
  created_by: string;
  created_at: number;
}

export async function onRequestGet(context: { request: Request; env: { DB: D1Database }; params: { id: string } }) {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录');

  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || ctx.campaignId !== params.id) return errorResponse(403, '非该团组成员');

  const row = await env.DB
    .prepare('SELECT id, name, description, invite_code, rulebooks, created_by, created_at FROM campaigns WHERE id = ?')
    .bind(params.id)
    .first<CampaignRow>();
  if (!row) return errorResponse(404, '团组不存在');

  let rulebooks: string[] = [];
  try {
    rulebooks = JSON.parse(row.rulebooks || '[]');
  } catch {
    rulebooks = [];
  }
  return jsonResponse({
    id: row.id,
    name: row.name,
    description: row.description,
    inviteCode: row.invite_code,
    rulebooks,
    createdBy: row.created_by,
    createdAt: row.created_at,
    myRole: ctx.role,
  });
}

export async function onRequestPatch(context: { request: Request; env: { DB: D1Database }; params: { id: string } }) {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录');

  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || ctx.campaignId !== params.id) return errorResponse(403, '非该团组成员');
  if (!auth.isAdmin && ctx.role !== 'dm') return errorResponse(403, '仅团组 DM 可修改团组设置');

  const body = await readJsonBody<{ name?: string; description?: string; rulebooks?: string[] }>(request);
  if (!body) return errorResponse(400, '请求体无效');

  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (typeof body.name === 'string' && body.name.trim()) {
    sets.push('name = ?');
    values.push(body.name.trim());
  }
  if (typeof body.description === 'string') {
    sets.push('description = ?');
    values.push(body.description.trim());
  }
  if (Array.isArray(body.rulebooks)) {
    sets.push('rulebooks = ?');
    values.push(JSON.stringify(body.rulebooks.filter((b) => typeof b === 'string' && b.trim())));
  }
  if (sets.length === 0) return errorResponse(400, '无可更新字段');
  values.push(params.id);

  await env.DB
    .prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
  return jsonResponse({ ok: true });
}
