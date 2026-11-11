// 角色卡变更请求：玩家提交（POST）与列表查询（GET）
// 权限模型：GET 按身份分流（DM 全量 / 玩家仅自己）；POST 玩家对自己绑定角色提交。
// 一卡一 pending：应用层校验 + 0014 部分唯一索引兜底。

import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  getCampaignContext,
} from '../../_utils';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) {
    return errorResponse(403, '非该团组成员');
  }

  const isDm = auth.isAdmin || ctx.role === 'dm';
  const mineOnly = new URL(request.url).searchParams.get('mine') === '1';

  try {
    let sql =
      'SELECT r.*, u.username AS requester_name, c.name AS character_name ' +
      'FROM character_change_requests r ' +
      'LEFT JOIN users u ON u.id = r.requester_id ' +
      'LEFT JOIN characters c ON c.id = r.character_id ' +
      'WHERE r.campaign_id = ?';
    const binds: (string | number)[] = [ctx.campaignId];
    if (!isDm || mineOnly) {
      sql += ' AND r.requester_id = ?';
      binds.push(auth.sub);
    }
    sql += ' ORDER BY r.created_at DESC LIMIT 200';
    const result = await env.DB.prepare(sql).bind(...binds).all();
    const rows = (result.results || []).map((row: any) => ({
      id: row.id,
      campaignId: row.campaign_id,
      characterId: row.character_id,
      characterName: row.character_name || undefined,
      requesterId: row.requester_id,
      requesterName: row.requester_name || undefined,
      payload: JSON.parse(row.payload),
      baseUpdatedAt: row.base_updated_at,
      note: row.note || undefined,
      status: row.status,
      reviewNote: row.review_note || undefined,
      reviewerId: row.reviewer_id || undefined,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at || undefined,
    }));
    return jsonResponse(rows);
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库查询失败');
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) {
    return errorResponse(403, '非该团组成员');
  }

  const body = await readJsonBody(request);
  const characterId = typeof body.characterId === 'string' ? body.characterId : '';
  const payload = body.payload;
  const baseUpdatedAt = typeof body.baseUpdatedAt === 'number' ? body.baseUpdatedAt : 0;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  if (!characterId || !payload || typeof payload !== 'object') {
    return errorResponse(400, '缺少 characterId 或 payload');
  }
  if (!baseUpdatedAt) {
    return errorResponse(400, '缺少 baseUpdatedAt（提交时基于的正式卡版本）');
  }
  // 提交者只能改自己绑定的角色卡（user_characters 关系为唯一授权源）
  const binding = await env.DB
    .prepare('SELECT 1 AS ok FROM user_characters WHERE user_id = ? AND character_id = ?')
    .bind(auth.sub, characterId)
    .first();
  if (!binding) {
    return errorResponse(403, '未绑定该角色卡');
  }
  // 角色卡必须属于当前团组
  const charRow = await env.DB
    .prepare('SELECT campaign_id FROM characters WHERE id = ?')
    .bind(characterId)
    .first<{ campaign_id: string | null }>();
  if (!charRow || (charRow.campaign_id || '') !== ctx.campaignId) {
    return errorResponse(404, '角色卡不存在或不属于当前团组');
  }

  const id = crypto.randomUUID();
  const ts = now();
  try {
    await env.DB
      .prepare(
        'INSERT INTO character_change_requests (id, campaign_id, character_id, requester_id, payload, base_updated_at, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, ctx.campaignId, characterId, auth.sub, JSON.stringify(payload), baseUpdatedAt, note || null, 'pending', ts)
      .run();
  } catch (e: any) {
    // 部分唯一索引 idx_ccr_one_pending 冲突 = 已有 pending
    if (String(e.message || '').includes('idx_ccr_one_pending') || String(e.message || '').includes('UNIQUE')) {
      return errorResponse(409, '该角色卡已有待审请求，请等待 DM 审批或先撤回');
    }
    return errorResponse(500, e.message || '数据库写入失败');
  }
  return jsonResponse({ id, status: 'pending', createdAt: ts });
}
