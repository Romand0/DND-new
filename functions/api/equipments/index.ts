import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now, verifyJwt } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  // 只验 JWT（不验 role，不验 DM_TOKEN）
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
  try {
    await verifyJwt(authHeader.slice(7), jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  try {
    const result = await env.DB
      .prepare('SELECT id, name, category, data, updated_at FROM equipments ORDER BY updated_at DESC')
      .all();
    const items = result.results.map((row: any) => JSON.parse(row.data));
    return jsonResponse(items);
  } catch (e: any) {
    return errorResponse(e.message || '数据库查询失败', 500);
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  // 统一认证（JWT 优先，DM_TOKEN 兜底）+ 校验 DM 角色
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  if (auth.role !== 'dm') {
    return errorResponse(403, '需要 DM 权限');
  }

  const body = await readJsonBody(request);

  // 批量创建
  if (Array.isArray(body)) {
    const timestamp = now();
    const validItems = body.filter((item: any) => item && typeof item.id === 'string' && item.id.length > 0);
    if (validItems.length === 0) {
      return errorResponse('数组中没有有效的装备数据（缺少 id）', 400);
    }
    const stmt = env.DB.prepare(
      'INSERT OR REPLACE INTO equipments (id, name, category, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const batch = validItems.map((item: any) => {
      const itemData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
      return stmt.bind(
        item.id,
        item.name || '',
        item.category || '杂项',
        JSON.stringify(itemData),
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
  const itemData = { ...body, createdAt: body.createdAt || timestamp, updatedAt: timestamp };
  try {
    await env.DB
      .prepare('INSERT INTO equipments (id, name, category, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(
        body.id,
        body.name,
        body.category || '杂项',
        JSON.stringify(itemData),
        timestamp,
        timestamp,
      )
      .run();
    return jsonResponse(itemData, 201);
  } catch (e: any) {
    return errorResponse(e.message || '创建失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
