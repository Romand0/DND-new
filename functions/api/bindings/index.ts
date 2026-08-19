import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env } = context;
  try {
    const result = await env.DB
      .prepare('SELECT * FROM spell_flow_bindings ORDER BY created_at DESC')
      .all();
    return jsonResponse(result.results);
  } catch (e: any) {
    return errorResponse(e.message || '查询绑定关系失败', 500);
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');

  const body = await readJsonBody(request);
  const { spell_id, flow_id } = body;

  if (!spell_id || !flow_id) {
    return errorResponse('缺少必要字段: spell_id, flow_id', 400);
  }

  // 检查法术和流程是否存在
  const [spell, flow] = await Promise.all([
    env.DB.prepare('SELECT id FROM spells WHERE id = ?').bind(spell_id).first(),
    env.DB.prepare('SELECT id FROM flows WHERE id = ?').bind(flow_id).first()
  ]);

  if (!spell) return errorResponse('法术不存在', 404);
  if (!flow) return errorResponse('流程不存在', 404);

  // 检查是否已经绑定
  const existing = await env.DB
    .prepare('SELECT id FROM spell_flow_bindings WHERE spell_id = ? AND flow_id = ?')
    .bind(spell_id, flow_id)
    .first();

  if (existing) {
    return errorResponse('该法术与流程已绑定', 400);
  }

  const timestamp = now();
  const bindingId = `binding-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

  await env.DB
    .prepare(`
      INSERT INTO spell_flow_bindings (id, spell_id, flow_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(bindingId, spell_id, flow_id, timestamp, timestamp)
    .run();

  return jsonResponse({ id: bindingId, spell_id, flow_id, created_at: timestamp }, 201);
}

export function onRequestOptions(context: any): Response {
  return handleOptions(context.request);
}