// 单个流程的获取、发布、删除
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  const row = await env.DB.prepare(
    'SELECT * FROM flows WHERE id = ?'
  ).bind(params.id).first();
  if (!row) return errorResponse(404, '流程不存在');
  return jsonResponse({
    ...JSON.parse((row as any).data),
    publishedVersion: (row as any).version,
    publishedAt: (row as any).published_at,
  });
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');
  const body: any = await readJsonBody(request);
  if (!body) return errorResponse('请求体为空', 400);
  const timestamp = now();
  const existing = await env.DB.prepare(
    'SELECT version FROM flows WHERE id = ?'
  ).bind(params.id).first();
  const nextVersion = existing ? ((existing as any).version as number) + 1 : 1;
  const flowData = {
    ...body,
    publishedVersion: nextVersion,
    publishedAt: existing ? body.publishedAt : timestamp,
    updatedAt: timestamp,
  };
  await env.DB.prepare(
    `INSERT INTO flows (id, name, category, version, data, published_at, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
     name=excluded.name, category=excluded.category, version=excluded.version,
     data=excluded.data, updated_at=excluded.updated_at`
  ).bind(
    params.id, body.name, body.category || 'custom', nextVersion,
    JSON.stringify(flowData),
    existing ? (flowData.publishedAt as number) : timestamp,
    timestamp,
    timestamp
  ).run();
  return jsonResponse(flowData);
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');
  await env.DB.prepare('DELETE FROM flows WHERE id = ?').bind(params.id).run();
  return jsonResponse({ success: true });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
