// 凭邀请码加入团组
// POST /api/campaigns/join   body {code} → 加入为玩家角色；已加入时幂等返回

import { authenticateRequest, errorResponse, jsonResponse, now, readJsonBody } from '../../_utils';

export async function onRequestPost(context: { request: Request; env: { DB: D1Database } }) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录');

  const body = await readJsonBody<{ code?: string }>(request);
  const code = body?.code?.trim().toUpperCase();
  if (!code) return errorResponse(400, '请输入邀请码');

  const camp = await env.DB
    .prepare('SELECT id, name FROM campaigns WHERE invite_code = ?')
    .bind(code)
    .first<{ id: string; name: string }>();
  if (!camp) return errorResponse(404, '邀请码无效');

  // 已加入：幂等处理，返回现有身份
  const existing = await env.DB
    .prepare('SELECT role FROM campaign_members WHERE campaign_id = ? AND user_id = ?')
    .bind(camp.id, auth.sub)
    .first<{ role: string }>();
  if (existing) {
    return jsonResponse({ id: camp.id, name: camp.name, myRole: existing.role, joined: false });
  }

  await env.DB
    .prepare(`INSERT INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, 'player', ?)`)
    .bind(camp.id, auth.sub, now())
    .run();
  return jsonResponse({ id: camp.id, name: camp.name, myRole: 'player', joined: true }, 201);
}
