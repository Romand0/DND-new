import { jsonResponse, errorResponse, handleOptions } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env, params } = context;
  const { flow_id } = params;

  try {
    const result = await env.DB
      .prepare(`
        SELECT b.*, s.name as spell_name, s.level as spell_level,
               s.school as spell_school, s.data as spell_data
        FROM spell_flow_bindings b
        JOIN spells s ON b.spell_id = s.id
        WHERE b.flow_id = ?
        ORDER BY b.created_at DESC
      `)
      .bind(flow_id)
      .all();

    const bindings = result.results.map((row: any) => ({
      id: row.id,
      spell_id: row.spell_id,
      flow_id: row.flow_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      spell: {
        id: row.spell_id,
        name: row.spell_name,
        level: row.spell_level,
        school: row.spell_school,
        data: JSON.parse(row.spell_data)
      }
    }));

    return jsonResponse(bindings);
  } catch (e: any) {
    return errorResponse(e.message || '查询流程绑定关系失败', 500);
  }
}

export function onRequestOptions(context: any): Response {
  return handleOptions(context.request);
}