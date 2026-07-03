import { jsonResponse, errorResponse, handleOptions, verifyDmToken, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env } = context;
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
  if (!verifyDmToken(request, env)) {
    return errorResponse('未授权', 401);
  }
  const body = await readJsonBody(request);
  
  if (Array.isArray(body)) {
    const timestamp = now();
    const stmt = env.DB.prepare(
      'INSERT OR REPLACE INTO equipments (id, name, category, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const batch = body.map((item: any) => {
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
      return jsonResponse({ count: body.length });
    } catch (e: any) {
      return errorResponse(e.message || '批量导入失败', 500);
    }
  }
  
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
