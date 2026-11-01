// 团组列表与创建
// GET  /api/campaigns        我加入的团组（含我在各团组的角色）
// POST /api/campaigns        创建团组（创建者登记为 DM）

import { authenticateRequest, errorResponse, jsonResponse, now, readJsonBody } from '../../_utils';

interface CampaignRow {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  rulebooks: string;
  created_by: string;
  created_at: number;
}

function serialize(row: CampaignRow, myRole: string) {
  let rulebooks: string[] = [];
  try {
    rulebooks = JSON.parse(row.rulebooks || '[]');
  } catch {
    rulebooks = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rulebooks,
    createdBy: row.created_by,
    createdAt: row.created_at,
    myRole,
  };
}

export async function onRequestGet(context: { request: Request; env: { DB: D1Database } }) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录');

  const { results } = await env.DB
    .prepare(
      `SELECT c.id, c.name, c.description, c.invite_code, c.rulebooks, c.created_by, c.created_at, m.role AS my_role
       FROM campaigns c
       JOIN campaign_members m ON m.campaign_id = c.id
       WHERE m.user_id = ?
       ORDER BY c.created_at ASC`
    )
    .bind(auth.sub)
    .all<CampaignRow & { my_role: string }>();

  return jsonResponse(results.map((r) => serialize(r, r.my_role)));
}

export async function onRequestPost(context: { request: Request; env: { DB: D1Database } }) {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录');

  const body = await readJsonBody<{ name?: string; description?: string }>(request);
  const name = body?.name?.trim();
  if (!name) return errorResponse(400, '团组名称必填');

  const id = crypto.randomUUID();
  // 邀请码取 UUID 无连字符前 8 位；唯一约束冲突概率可忽略，冲突时由下次重置解决
  const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8);

  await env.DB
    .prepare(
      `INSERT INTO campaigns (id, name, description, invite_code, rulebooks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, body?.description?.trim() || '', inviteCode, '[]', auth.sub, now())
    .run();
  await env.DB
    .prepare(`INSERT INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, 'dm', ?)`)
    .bind(id, auth.sub, now())
    .run();

  return jsonResponse({ id, name, description: body?.description?.trim() || '', rulebooks: [], myRole: 'dm' }, 201);
}
