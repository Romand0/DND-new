import { jsonResponse, errorResponse, handleOptions, authenticateRequest } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env, params } = context;
  const { id } = params;

  try {
    const binding = await env.DB
      .prepare('SELECT * FROM spell_flow_bindings WHERE id = ?')
      .bind(id)
      .first();

    if (!binding) {
      return errorResponse('绑定关系不存在', 404);
    }

    return jsonResponse(binding);
  } catch (e: any) {
    return errorResponse(e.message || '查询绑定关系失败', 500);
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');

  const { id } = params;

  try {
    const result = await env.DB
      .prepare('DELETE FROM spell_flow_bindings WHERE id = ?')
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return errorResponse('绑定关系不存在', 404);
    }

    return jsonResponse({ success: true });
  } catch (e: any) {
    return errorResponse(e.message || '删除绑定关系失败', 500);
  }
}

export function onRequestOptions(context: any): Response {
  return handleOptions(context.request);
}