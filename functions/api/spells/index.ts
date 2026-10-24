import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env } = context;
  try {
    const result = await env.DB
      .prepare('SELECT id, name, level, school, data, updated_at FROM spells ORDER BY level ASC, name ASC')
      .all();
    // data 列是完整对象快照；为空/畸形时回退行级字段，防止单条脏数据污染整个列表
    const items = result.results.map((row: any) => {
      try {
        const parsed = JSON.parse(row.data);
        if (parsed && typeof parsed === 'object' && parsed.name) return parsed;
      } catch {
        // fallthrough
      }
      return { id: row.id, name: row.name, level: row.level, school: row.school, updatedAt: row.updated_at };
    });
    return jsonResponse(items);
  } catch (e: any) {
    return errorResponse(e.message || '数据库查询失败', 500);
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }

  const body = await readJsonBody(request);

  // 批量创建
  if (Array.isArray(body)) {
    const timestamp = now();
    const validItems = body.filter((item: any) => item && typeof item.id === 'string' && item.id.length > 0);
    if (validItems.length === 0) {
      return errorResponse('数组中没有有效的法术数据（缺少 id）', 400);
    }
    const stmt = env.DB.prepare(
      'INSERT OR REPLACE INTO spells (id, name, level, school, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const batch = validItems.map((item: any) => {
      const itemData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
      return stmt.bind(
        item.id,
        item.name || '',
        item.level || 0,
        item.school || '',
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
      .prepare('INSERT INTO spells (id, name, level, school, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        body.id,
        body.name,
        body.level || 0,
        body.school || '',
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
