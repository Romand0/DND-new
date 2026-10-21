import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: any): Promise<Response> {
  const { env } = context;
  try {
    const result = await env.DB
      .prepare('SELECT id, name, category, parent_name, source, data, updated_at FROM character_options ORDER BY category ASC, name ASC')
      .all();
    const items = result.results.map((row: any) => JSON.parse(row.data));
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
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
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
    'INSERT OR REPLACE INTO character_options (id, name, category, parent_name, source, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const batch = validItems.map((item: any) => {
    const itemData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
    return stmt.bind(
      item.id,
      item.name || '',
      item.category,
      item.parentName || '',
      item.source || '',
      JSON.stringify(itemData),
      item.createdAt || timestamp,
      timestamp,
    );
  });
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
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return errorResponse(400, '缺少 id 参数');
  }
  try {
    await env.DB.prepare('DELETE FROM character_options WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '删除失败');
  }
}
