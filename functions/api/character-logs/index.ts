// 角色全周期日志：批量上报（POST）与查询（GET）。
// 写权限：登录成员，且角色卡属当前团组；玩家只允许上报自己绑定的角色。
// 读权限：DM 全量查询本团组；玩家仅查自己绑定的角色。

import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  getCampaignContext,
} from '../../_utils';

interface LogInput {
  characterId?: string;
  category?: string;
  kind?: string;
  title?: string;
  detail?: string;
  source?: string;
}

const VALID_CATEGORIES = new Set(['item', 'spell', 'growth', 'general']);

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
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
  const inputs: LogInput[] = Array.isArray(body) ? body : [body];
  const valid = inputs.filter(
    (x) => x && typeof x.characterId === 'string' && x.characterId
      && VALID_CATEGORIES.has(x.category ?? '')
      && typeof x.title === 'string' && x.title.trim(),
  );
  if (valid.length === 0) {
    return errorResponse(400, '没有有效的日志条目（缺 characterId/category/title）');
  }

  // 写权限校验：DM 全量；玩家仅自己绑定的角色
  const isDm = auth.isAdmin || ctx.role === 'dm';
  if (!isDm) {
    const bound = await env.DB
      .prepare(
        `SELECT COUNT(*) AS n FROM user_characters WHERE user_id = ? AND character_id IN (${valid.map(() => '?').join(',')})`
      )
      .bind(auth.sub, ...valid.map((x) => x.characterId))
      .first<{ n: number }>();
    if (!bound || bound.n < valid.length) {
      return errorResponse(403, '存在未绑定角色卡的日志条目');
    }
  }

  // 角色卡归属校验（一次查询覆盖全部 characterId）
  const charIds = [...new Set(valid.map((x) => x.characterId as string))];
  const owned = await env.DB
    .prepare(
      `SELECT COUNT(*) AS n FROM characters WHERE campaign_id = ? AND id IN (${charIds.map(() => '?').join(',')})`
    )
    .bind(ctx.campaignId, ...charIds)
    .first<{ n: number }>();
  if (!owned || owned.n < charIds.length) {
    return errorResponse(404, '存在不属于当前团组的角色卡');
  }

  const ts = now();
  const stmt = env.DB.prepare(
    'INSERT INTO character_logs (id, campaign_id, character_id, category, kind, title, detail, source, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const batch = valid.map((x) =>
    stmt.bind(
      crypto.randomUUID(),
      ctx.campaignId,
      x.characterId,
      x.category,
      x.kind || 'dm_edit',
      (x.title as string).slice(0, 500),
      x.detail ? String(x.detail).slice(0, 4000) : null,
      x.source || null,
      auth.sub,
      ts,
    ),
  );
  try {
    await env.DB.batch(batch);
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库写入失败');
  }
  return jsonResponse({ inserted: valid.length });
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

  const url = new URL(request.url);
  const characterId = url.searchParams.get('characterId') || '';
  const category = url.searchParams.get('category') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);
  if (!characterId) {
    return errorResponse(400, '缺少 characterId');
  }

  // 玩家只能查自己绑定的角色
  const isDm = auth.isAdmin || ctx.role === 'dm';
  if (!isDm) {
    const bound = await env.DB
      .prepare('SELECT 1 AS ok FROM user_characters WHERE user_id = ? AND character_id = ?')
      .bind(auth.sub, characterId)
      .first();
    if (!bound) {
      return errorResponse(403, '未绑定该角色卡');
    }
  }

  try {
    let sql = 'SELECT * FROM character_logs WHERE campaign_id = ? AND character_id = ?';
    const binds: (string | number)[] = [ctx.campaignId, characterId];
    if (category && VALID_CATEGORIES.has(category)) {
      sql += ' AND category = ?';
      binds.push(category);
    }
    sql += ' ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?';
    binds.push(limit, offset);
    const result = await env.DB.prepare(sql).bind(...binds).all();
    const rows = (result.results || []).map((row: any) => ({
      id: row.id,
      campaignId: row.campaign_id,
      characterId: row.character_id,
      category: row.category,
      kind: row.kind,
      title: row.title,
      detail: row.detail || undefined,
      source: row.source || undefined,
      actorId: row.actor_id || undefined,
      createdAt: row.created_at,
    }));
    return jsonResponse(rows);
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库查询失败');
  }
}
