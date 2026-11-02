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

type Row = { data: string; campaign_id: string | null };

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;

  // 未登录（访客公开浏览）与登录无团组用户按公开分支处理：仅出版物条目可读
  const auth = await authenticateRequest(request, env);
  const scope = auth ? await resolveLibraryScope(request, env, auth) : null;

  const id = params.id;
  try {
    const row = await env.DB
      .prepare('SELECT data, campaign_id FROM equipments WHERE id = ?')
      .bind(id)
      .first<Row>();
    if (!row) {
      return errorResponse(404, '装备不存在');
    }
    if (!scope) {
      // 公开分支：团组条目按 404 处理，不暴露条目存在性
      if (row.campaign_id) return errorResponse(404, '装备不存在');
      return jsonResponse(JSON.parse(row.data));
    }
    // 跨团组私有条目按 404 处理：不向非归属成员暴露条目存在性
    if (!canReadEntry(scope, row.campaign_id)) {
      return errorResponse(404, '装备不存在');
    }
    return jsonResponse(JSON.parse(row.data));
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
      .prepare('SELECT campaign_id FROM equipments WHERE id = ?')
      .bind(id)
      .first<{ campaign_id: string | null }>();
    if (!row) {
      return errorResponse(404, '装备不存在');
    }
    const targetOwner = body.campaignId === null ? null : (body.campaignId ?? row.campaign_id);
    // 修改或转移归属都需要权限：出版物件与跨团组转移仅站点管理员
    if (!canWriteEntry(scope, auth, row.campaign_id) || (targetOwner !== row.campaign_id && !auth.isAdmin)) {
      return errorResponse(403, '无权修改该条目');
    }
    const timestamp = now();
    const itemData = { ...body, id, campaignId: targetOwner, updatedAt: timestamp };
    const result = await env.DB
      .prepare('UPDATE equipments SET name = ?, category = ?, data = ?, campaign_id = ?, updated_at = ? WHERE id = ?')
      .bind(
        body.name || '',
        body.category || '杂项',
        JSON.stringify(itemData),
        targetOwner,
        timestamp,
        id,
      )
      .run();
    if (result.meta.changes === 0) {
      return errorResponse(404, '装备不存在');
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
      .prepare('SELECT campaign_id FROM equipments WHERE id = ?')
      .bind(id)
      .first<{ campaign_id: string | null }>();
    if (!row) {
      return errorResponse(404, '装备不存在');
    }
    if (!canWriteEntry(scope, auth, row.campaign_id)) {
      return errorResponse(403, '无权删除该条目');
    }
    const result = await env.DB
      .prepare('DELETE FROM equipments WHERE id = ?')
      .bind(id)
      .run();
    if (result.meta.changes === 0) {
      return errorResponse(404, '装备不存在');
    }
    return jsonResponse({ success: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '删除失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
