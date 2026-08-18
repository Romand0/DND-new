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
    'SELECT version, published_at FROM flows WHERE id = ?'
  ).bind(params.id).first();
  
  const nextVersion = existing ? ((existing as any).version as number) + 1 : 1;
  const publishedAt = existing ? 
    (typeof body.publishedAt === 'number' ? body.publishedAt : (existing as any).published_at) : 
    timestamp;
  
  const flowData = {
    ...body,
    publishedVersion: nextVersion,
    publishedAt: publishedAt,
    updatedAt: timestamp,
  };
  
  try {
    const serializedData = JSON.stringify(flowData);
    
    await env.DB.prepare(
      `INSERT INTO flows (id, name, category, version, data, published_at, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, category=excluded.category, version=excluded.version,
       data=excluded.data, published_at=excluded.published_at, updated_at=excluded.updated_at`
    ).bind(
      params.id, 
      body.name || '', 
      body.category || 'custom', 
      nextVersion,
      serializedData,
      publishedAt,
      timestamp,
      existing ? (existing as any).created_at : timestamp
    ).run();
    
    return jsonResponse(flowData);
  } catch (error) {
    console.error('发布失败:', error);
    return errorResponse(500, `发布失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
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
