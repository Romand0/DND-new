// 列出所有已发布流程 / 批量发布
import { authenticateRequest, errorResponse, jsonResponse, readJsonBody, getDb } from '../_utils';

export async function onRequestGet(context: any) {
  const { request } = context;
  const auth = await authenticateRequest(request);
  if (!auth) return errorResponse(401, '未授权');
  const db = getDb(context.env);
  const { results } = await db.prepare(
    'SELECT id, name, category, version, data, published_at, updated_at FROM flows ORDER BY updated_at DESC'
  ).all();
  const flows = results.map((row: any) => ({
    ...JSON.parse(row.data),
    publishedVersion: row.version,
    publishedAt: row.published_at,
  }));
  return jsonResponse(flows);
}

export async function onRequestPost(context: any) {
  const { request } = context;
  const auth = await authenticateRequest(request);
  if (!auth || auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');
  const flows: any[] = await readJsonBody(request);
  const timestamp = Date.now();
  const db = getDb(context.env);
  const stmt = db.prepare(
    `INSERT INTO flows (id, name, category, version, data, published_at, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
     name=excluded.name, category=excluded.category, version=excluded.version,
     data=excluded.data, updated_at=excluded.updated_at`
  );
  const batch = flows.map((flow: any) =>
    stmt.bind(
      flow.id, flow.name, flow.category || 'custom',
      flow.publishedVersion || 1,
      JSON.stringify(flow),
      flow.publishedAt || timestamp,
      timestamp,
      timestamp
    )
  );
  await db.batch(batch);
  return jsonResponse({ success: true });
}
