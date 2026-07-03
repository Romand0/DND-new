import { jsonResponse, errorResponse, handleOptions, verifyJwt, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;
  const id = params.id;
    // JWT 鉴权
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  try {
    await verifyJwt(authHeader.slice(7), env.JWT_SECRET);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  try {
    const result = await env.DB
      .prepare('SELECT data FROM characters WHERE id = ?')
      .bind(id)
      .first();
    if (!result) {
      return errorResponse('角色不存在', 404);
    }
    return jsonResponse(JSON.parse(result.data as string));
  } catch (e: any) {
    return errorResponse(e.message || '查询失败', 500);
  }
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;
  if (!verifyDmToken(request, env)) {
    return errorResponse('未授权', 401);
  }
  const id = params.id;
  const body = await readJsonBody(request);
  if (!body) {
    return errorResponse('请求体为空', 400);
  }
  const timestamp = now();
  const charData = { ...body, id, updatedAt: timestamp };
  try {
    const result = await env.DB
      .prepare('UPDATE characters SET name = ?, class = ?, level = ?, race = ?, data = ?, updated_at = ? WHERE id = ?')
      .bind(
        body.name || '',
        body.class || '',
        body.level || 1,
        body.race || '',
        JSON.stringify(charData),
        timestamp,
        id,
      )
      .run();
    if (result.meta.changes === 0) {
      return errorResponse('角色不存在', 404);
    }
    return jsonResponse(charData);
  } catch (e: any) {
    return errorResponse(e.message || '更新失败', 500);
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;
  if (!verifyDmToken(request, env)) {
    return errorResponse('未授权', 401);
  }
  const id = params.id;
  try {
    const result = await env.DB
      .prepare('DELETE FROM characters WHERE id = ?')
      .bind(id)
      .run();
    if (result.meta.changes === 0) {
      return errorResponse('角色不存在', 404);
    }
    return jsonResponse({ success: true });
  } catch (e: any) {
    return errorResponse(e.message || '删除失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
