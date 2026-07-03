import { jsonResponse, errorResponse, handleOptions, verifyDmToken, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  try {
    const result = await env.DB
      .prepare('SELECT id, name, class, level, race, data, updated_at FROM characters ORDER BY updated_at DESC')
      .all();
    const characters = result.results.map((row: any) => JSON.parse(row.data));
    return jsonResponse(characters);
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
      'INSERT OR REPLACE INTO characters (id, name, class, level, race, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const batch = body.map((item: any) => {
      const charData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
      return stmt.bind(
        item.id,
        item.name || '',
        item.class || '',
        item.level || 1,
        item.race || '',
        JSON.stringify(charData),
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
  const charData = { ...body, createdAt: body.createdAt || timestamp, updatedAt: timestamp };
  try {
    await env.DB
      .prepare('INSERT INTO characters (id, name, class, level, race, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        body.id,
        body.name,
        body.class || '',
        body.level || 1,
        body.race || '',
        JSON.stringify(charData),
        timestamp,
        timestamp,
      )
      .run();
    return jsonResponse(charData, 201);
  } catch (e: any) {
    return errorResponse(e.message || '创建失败', 500);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
