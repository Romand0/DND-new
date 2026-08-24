// 草稿 CRUD：fork / read / save / discard
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../../_utils';

/** GET：获取草稿（若不存在返回 404） */
export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');

  const row = await env.DB.prepare(
    'SELECT data, forked_at, updated_at FROM flow_drafts WHERE parent_id = ?'
  ).bind(params.id).first();

  if (!row) return errorResponse(404, '草稿不存在');

  return jsonResponse({
    parentId: params.id,
    data: JSON.parse((row as any).data),
    forkedAt: (row as any).forked_at,
    updatedAt: (row as any).updated_at,
  });
}

/** PUT：fork 或保存草稿（upsert） */
export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');

  const body: any = await readJsonBody(request);
  if (!body?.data) return errorResponse(400, '请求体缺少 data 字段');

  const timestamp = now();
  const serializedData = JSON.stringify(body.data);

  // upsert：若草稿已存在则更新，否则 fork 新草稿
  await env.DB.prepare(
    `INSERT INTO flow_drafts (parent_id, data, forked_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(parent_id) DO UPDATE SET
       data=excluded.data, updated_at=excluded.updated_at`
  ).bind(params.id, serializedData, timestamp, timestamp).run();

  return jsonResponse({ success: true, parentId: params.id });
}

/** DELETE：放弃草稿 */
export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');

  await env.DB.prepare('DELETE FROM flow_drafts WHERE parent_id = ?')
    .bind(params.id).run();

  return jsonResponse({ success: true });
}

export function onRequestOptions(context: any): Response {
  return handleOptions(context.request);
}