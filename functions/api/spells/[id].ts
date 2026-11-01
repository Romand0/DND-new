import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  resolveLibraryScope,
  canReadEntry,
  canWriteEntry,
} from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
  }

  const id = params.id;
  try {
    const spellResult = await env.DB
      .prepare('SELECT data, campaign_id FROM spells WHERE id = ?')
      .bind(id)
      .first<{ data: string; campaign_id: string | null }>();
    if (!spellResult || !canReadEntry(scope, spellResult.campaign_id)) {
      return errorResponse(404, '法术不存在');
    }

    const spellData = JSON.parse(spellResult.data);

    // 获取绑定的流程信息
    const bindingsResult = await env.DB
      .prepare(`
        SELECT f.* FROM spell_flow_bindings b
        JOIN flows f ON b.flow_id = f.id
        WHERE b.spell_id = ?
      `)
      .bind(id)
      .all();

    const boundFlows = bindingsResult.results.map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      data: JSON.parse(row.data),
      publishedVersion: row.version,
      publishedAt: row.published_at
    }));

    return jsonResponse({
      ...spellData,
      boundFlows,
      bindingsCount: boundFlows.length
    });
  } catch (e: any) {
    return errorResponse(500, e.message || '查询失败');
  }
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
  }

  const id = params.id;
  const body = await readJsonBody(request);
  if (!body) {
    return errorResponse(400, '请求体为空');
  }
  try {
    const row = await env.DB
      .prepare('SELECT campaign_id FROM spells WHERE id = ?')
      .bind(id)
      .first<{ campaign_id: string | null }>();
    if (!row) {
      return errorResponse(404, '法术不存在');
    }
    const targetOwner = body.campaignId === null ? null : (body.campaignId ?? row.campaign_id);
    if (!canWriteEntry(scope, auth, row.campaign_id) || (targetOwner !== row.campaign_id && !auth.isAdmin)) {
      return errorResponse(403, '无权修改该条目');
    }
    const timestamp = now();
    const itemData = { ...body, id, campaignId: targetOwner, updatedAt: timestamp };
    const result = await env.DB
      .prepare('UPDATE spells SET name = ?, level = ?, school = ?, data = ?, campaign_id = ?, updated_at = ? WHERE id = ?')
      .bind(
        body.name || '',
        body.level || 0,
        body.school || '',
        JSON.stringify(itemData),
        targetOwner,
        timestamp,
        id,
      )
      .run();
    if (result.meta.changes === 0) {
      return errorResponse(404, '法术不存在');
    }
    return jsonResponse(itemData);
  } catch (e: any) {
    return errorResponse(500, e.message || '更新失败');
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
  }

  const id = params.id;
  try {
    const row = await env.DB
      .prepare('SELECT campaign_id FROM spells WHERE id = ?')
      .bind(id)
      .first<{ campaign_id: string | null }>();
    if (!row) {
      return errorResponse(404, '法术不存在');
    }
    if (!canWriteEntry(scope, auth, row.campaign_id)) {
      return errorResponse(403, '无权删除该条目');
    }
    const result = await env.DB
      .prepare('DELETE FROM spells WHERE id = ?')
      .bind(id)
      .run();
    if (result.meta.changes === 0) {
      return errorResponse(404, '法术不存在');
    }
    return jsonResponse({ success: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '删除失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
