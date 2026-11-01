import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  resolveLibraryScope,
  libraryFilterClause,
  resolveNewEntryCampaignId,
} from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
  }

  try {
    const { clause, binds } = libraryFilterClause(scope, "json_extract(data, '$.source')");
    const result = await env.DB
      .prepare(`SELECT id, name, level, school, data, campaign_id, updated_at FROM spells ${clause} ORDER BY level ASC, name ASC`)
      .bind(...binds)
      .all();
    // data 列是完整对象快照；为空/畸形时回退行级字段，防止单条脏数据污染整个列表
    const items = result.results.map((row: any) => {
      try {
        const parsed = JSON.parse(row.data);
        if (parsed && typeof parsed === 'object' && parsed.name) {
          if (parsed.campaignId === undefined && row.campaign_id) parsed.campaignId = row.campaign_id;
          return parsed;
        }
      } catch {
        // fallthrough
      }
      return { id: row.id, name: row.name, level: row.level, school: row.school, campaignId: row.campaign_id, updatedAt: row.updated_at };
    });
    return jsonResponse(items);
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
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
  }

  const body = await readJsonBody(request);

  // 批量创建
  if (Array.isArray(body)) {
    const timestamp = now();
    const validItems = body.filter((item: any) => item && typeof item.id === 'string' && item.id.length > 0);
    if (validItems.length === 0) {
      return errorResponse(400, '数组中没有有效的法术数据（缺少 id）');
    }
    let ownerFailed: string | null = null;
    const stmt = env.DB.prepare(
      'INSERT OR REPLACE INTO spells (id, name, level, school, data, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const batch = validItems.map((item: any) => {
      const itemData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
      let ownerId: string | null = scope.ctx.campaignId;
      if (item.campaignId === null) {
        if (!auth.isAdmin) {
          ownerFailed = item.id;
          return null;
        }
        ownerId = null;
      }
      itemData.campaignId = ownerId;
      return stmt.bind(
        item.id,
        item.name || '',
        item.level || 0,
        item.school || '',
        JSON.stringify(itemData),
        ownerId,
        item.createdAt || timestamp,
        timestamp,
      );
    });
    if (ownerFailed) {
      return errorResponse(403, `出版物条目仅站点管理员可创建（id: ${ownerFailed}）`);
    }
    try {
      await env.DB.batch(batch);
      return jsonResponse({ count: validItems.length });
    } catch (e: any) {
      return errorResponse(500, `批量导入失败: ${e.message || '未知数据库错误'}`);
    }
  }

  // 单条创建
  if (!body || !body.id || !body.name) {
    return errorResponse(400, '缺少必要字段: id, name');
  }
  let ownerId: string | null;
  try {
    ownerId = resolveNewEntryCampaignId(scope, auth, body.campaignId);
  } catch (e: any) {
    return errorResponse(403, e.message || '无权创建');
  }
  const timestamp = now();
  const itemData = { ...body, campaignId: ownerId, createdAt: body.createdAt || timestamp, updatedAt: timestamp };
  try {
    await env.DB
      .prepare('INSERT INTO spells (id, name, level, school, data, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        body.id,
        body.name,
        body.level || 0,
        body.school || '',
        JSON.stringify(itemData),
        ownerId,
        timestamp,
        timestamp,
      )
      .run();
    return jsonResponse(itemData, 201);
  } catch (e: any) {
    return errorResponse(500, e.message || '创建失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
