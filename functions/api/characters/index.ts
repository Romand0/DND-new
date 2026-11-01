import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  getCampaignContext,
  DEFAULT_CAMPAIGN_ID,
} from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  // 团组作用域：仅返回当前团组的角色卡（存量无归属行已由 0012 回填默认团组）
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) {
    return errorResponse(403, '非该团组成员');
  }

  try {
    const result = await env.DB
      .prepare('SELECT id, name, class, level, race, data, campaign_id, updated_at FROM characters WHERE campaign_id = ? ORDER BY updated_at DESC')
      .bind(ctx.campaignId || DEFAULT_CAMPAIGN_ID)
      .all();
    const characters = result.results.map((row: any) => {
      const parsed = JSON.parse(row.data);
      if (parsed.campaignId === undefined && row.campaign_id) parsed.campaignId = row.campaign_id;
      return parsed;
    });
    return jsonResponse(characters);
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库查询失败');
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  // 统一认证（JWT 优先，DM_TOKEN 兜底）+ 校验 DM 角色
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }

  const body = await readJsonBody(request);

  // 批量创建
  if (Array.isArray(body)) {
    const timestamp = now();
    const validItems = body.filter((item: any) => item && typeof item.id === 'string' && item.id.length > 0);
    if (validItems.length === 0) {
      return errorResponse('数组中没有有效的角色数据（缺少 id）', 400);
    }
    const stmt = env.DB.prepare(
      'INSERT OR REPLACE INTO characters (id, name, class, level, race, data, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const batch = validItems.map((item: any) => {
      const charData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
      const ownerId = typeof item.campaignId === 'string' && item.campaignId ? item.campaignId : null;
      return stmt.bind(
        item.id,
        item.name || '',
        item.class || '',
        item.level || 1,
        item.race || '',
        JSON.stringify(charData),
        ownerId,
        item.createdAt || timestamp,
        timestamp,
      );
    });
    try {
      await env.DB.batch(batch);
      return jsonResponse({ count: validItems.length });
    } catch (e: any) {
      return errorResponse(`批量导入失败: ${e.message || '未知数据库错误'}`, 500);
    }
  }

  // 单条创建
  if (!body || !body.id || !body.name) {
    return errorResponse('缺少必要字段: id, name', 400);
  }
  const timestamp = now();
  const charData = { ...body, createdAt: body.createdAt || timestamp, updatedAt: timestamp };
  try {
    await env.DB
      .prepare('INSERT INTO characters (id, name, class, level, race, data, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        body.id,
        body.name,
        body.class || '',
        body.level || 1,
        body.race || '',
        JSON.stringify(charData),
        typeof body.campaignId === 'string' && body.campaignId ? body.campaignId : null,
        timestamp,
        timestamp,
      )
      .run();
    return jsonResponse(charData, 201);
  } catch (e: any) {
    return errorResponse(500, e.message || '创建失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
