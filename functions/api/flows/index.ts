// 列出所有已发布流程 / 批量发布
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  const { results } = await env.DB.prepare(
    'SELECT id, name, category, version, data, published_at, updated_at FROM flows ORDER BY updated_at DESC'
  ).all();
  const flows = results.map((row: any) => ({
    ...JSON.parse(row.data),
    publishedVersion: row.version,
    publishedAt: row.published_at,
  }));
  return jsonResponse(flows);
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');
  const flows: any[] | null = await readJsonBody(request);
  if (!flows || !Array.isArray(flows) || flows.length === 0) {
    return errorResponse('请求体必须是流程数组', 400);
  }
  const timestamp = now();
  const stmt = env.DB.prepare(
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
  await env.DB.batch(batch);
  return jsonResponse({ success: true });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
