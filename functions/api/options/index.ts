import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  resolveLibraryScope,
  libraryFilterClause,
  canWriteEntry,
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
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
  }
  try {
    // character_options 有独立 source 提取列，过滤用列表达式（其余库用 json_extract）
    const { clause, binds } = libraryFilterClause(scope, 'source');
    const result = await env.DB
      .prepare(`SELECT id, name, category, parent_name, source, data, campaign_id, updated_at FROM character_options ${clause} ORDER BY category ASC, name ASC`)
      .bind(...binds)
      .all();
    const items = result.results.map((row: any) => {
      const parsed = JSON.parse(row.data);
      if (parsed.campaignId === undefined && row.campaign_id) parsed.campaignId = row.campaign_id;
      return parsed;
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
  if (!Array.isArray(body)) {
    return errorResponse(400, '请传入选项数组');
  }
  const validItems = body.filter((item: any) => item && typeof item.id === 'string' && item.id.length > 0 && typeof item.category === 'string');
  if (validItems.length === 0) {
    return errorResponse(400, '数组中没有有效的选项数据（缺少 id 或 category）');
  }
  const timestamp = now();
  const stmt = env.DB.prepare(
    'INSERT OR REPLACE INTO character_options (id, name, category, parent_name, source, data, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const batch = validItems.map((item: any) => {
    const itemData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
    let ownerId: string | null = scope.ctx.campaignId;
    if (item.campaignId === null) {
      if (!auth.isAdmin) {
        return null;
      }
      ownerId = null;
    }
    itemData.campaignId = ownerId;
    return stmt.bind(
      item.id,
      item.name || '',
      item.category,
      item.parentName || '',
      item.source || '',
      JSON.stringify(itemData),
      ownerId,
      item.createdAt || timestamp,
      timestamp,
    );
  });
  if (batch.some((b) => b === null)) {
    return errorResponse(403, '出版物条目仅站点管理员可创建');
  }
  try {
    await env.DB.batch(batch);
    return jsonResponse({ count: validItems.length });
  } catch (e: any) {
    return errorResponse(500, `批量导入失败: ${e.message || '未知数据库错误'}`);
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return errorResponse(400, '缺少 id 参数');
  }
  try {
    const row = await env.DB
      .prepare('SELECT campaign_id FROM character_options WHERE id = ?')
      .bind(id)
      .first<{ campaign_id: string | null }>();
    if (!row) {
      return errorResponse(404, '选项不存在');
    }
    if (!canWriteEntry(scope, auth, row.campaign_id)) {
      return errorResponse(403, '无权删除该条目');
    }
    await env.DB.prepare('DELETE FROM character_options WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '删除失败');
  }
}
