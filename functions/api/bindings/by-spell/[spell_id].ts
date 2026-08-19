import { jsonResponse, errorResponse, handleOptions } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env, params } = context;
  const { spell_id } = params;

  try {
    const result = await env.DB
      .prepare(`
        SELECT b.*, f.name as flow_name, f.category as flow_category, 
               f.data as flow_data, f.version as flow_version,
               f.published_at as flow_published_at
        FROM spell_flow_bindings b
        JOIN flows f ON b.flow_id = f.id
        WHERE b.spell_id = ?
        ORDER BY b.created_at DESC
      `)
      .bind(spell_id)
      .all();

    const bindings = result.results.map((row: any) => ({
      id: row.id,
      spell_id: row.spell_id,
      flow_id: row.flow_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      flow: {
        id: row.flow_id,
        name: row.flow_name,
        category: row.flow_category,
        data: JSON.parse(row.flow_data),
        publishedVersion: row.flow_version,
        publishedAt: row.flow_published_at
      }
    }));

    return jsonResponse(bindings);
  } catch (e: any) {
    return errorResponse(e.message || '查询法术绑定关系失败', 500);
  }
}

export function onRequestOptions(context: any): Response {
  return handleOptions(context.request);
}