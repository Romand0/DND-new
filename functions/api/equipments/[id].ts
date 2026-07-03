import { jsonResponse, errorResponse, handleOptions, verifyJwt, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;
  // JWT 鉴权（加兜底）
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    await verifyJwt(authHeader.slice(7), jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  const id = params.id;
  try {
    const result = await env.DB
      .prepare('SELECT data FROM equipments WHERE id = ?')
      .bind(id)
      .first();
    if (!result) {
      return errorResponse('装备不存在', 404);
    }
    return jsonResponse(JSON.parse(result.data as string));
  } catch (e: any) {
    return errorResponse(e.message || '查询失败', 500);
  }
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;
  // JWT 鉴权 + DM 角色校验
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  let payload: { sub: string; role: string };
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    payload = await verifyJwt(authHeader.slice(7), jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }
  if (payload.role !== 'dm') {
    return errorResponse(403, '需要 DM 权限');
  }

  const id = params.id;
  const body = await readJsonBody(request);
  if (!body) {
    return errorResponse('请求体为空', 400);
  }
  const timestamp = now();
  const itemData = { ...body, id, updatedAt: timestamp };
  try {
    const result = await env.DB
      .prepare('UPDATE equipments SET name = ?, category = ?, data = ?, updated_at = ? WHERE id = ?')
      .bind(
        body.name || '',
        body.category || '杂项',
        JSON.stringify(itemData),
        timestamp,
        id,
      )
      .run();
    if (result.meta.changes === 0) {
      return errorResponse('装备不存在', 404);
    }
    return jsonResponse(itemData);
  } catch (e: any) {
    return errorResponse(e.message || '更新失败', 500);
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;
  // JWT 鉴权 + DM 角色校验
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  let payload: { sub: string; role: string };
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    payload = await verifyJwt(authHeader.slice(7), jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }
  if (payload.role !== 'dm') {
    return errorResponse(403, '需要 DM 权限');
  }

  const id = params.id;
  try {
    const result = await env.DB
      .prepare('DELETE FROM equipments WHERE id = ?')
      .bind(id)
      .run();
    if (result.meta.changes === 0) {
      return errorResponse('装备不存在', 404);
    }
    return jsonResponse({ success: true });
  } catch (e: any) {
    return errorResponse(e.message || '删除失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
