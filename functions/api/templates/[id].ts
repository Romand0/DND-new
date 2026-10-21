// NPC 模板单条：GET 读取（登录用户）、PUT 更新（DM）、DELETE 删除（DM）
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env, params } = context;
  const auth = await authenticateRequest(context.request, env);
  if (!auth) return errorResponse(401, '未授权');
  try {
    const row = await env.DB
      .prepare('SELECT data FROM npc_templates WHERE id = ?')
      .bind(params.id)
      .first();
    if (!row) return errorResponse(404, '模板不存在');
    return jsonResponse(JSON.parse((row as any).data));
  } catch (e: any) {
    return errorResponse(500, e.message || '查询失败');
  }
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;

  // 统一认证（JWT 优先，DM_TOKEN 兜底）+ 校验 DM 角色
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }

  const id = params.id;
  const body = await readJsonBody(request);
  if (!body) {
    return errorResponse(400, '请求体为空');
  }
  const timestamp = now();
  const itemData = { ...body, id, updatedAt: timestamp };
  try {
    const result = await env.DB
      .prepare('UPDATE npc_templates SET name = ?, cr = ?, creature_type = ?, data = ?, updated_at = ? WHERE id = ?')
      .bind(
        body.name || '',
        body.cr || '',
        body.type || body.creatureType || '',
        JSON.stringify(itemData),
        timestamp,
        id,
      )
      .run();
    if (result.meta.changes === 0) {
      return errorResponse(404, '模板不存在');
    }
    return jsonResponse(itemData);
  } catch (e: any) {
    return errorResponse(500, e.message || '更新失败');
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;

  // 统一认证（JWT 优先，DM_TOKEN 兜底）+ 校验 DM 角色
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }

  const id = params.id;
  try {
    const result = await env.DB
      .prepare('DELETE FROM npc_templates WHERE id = ?')
      .bind(id)
      .run();
    if (result.meta.changes === 0) {
      return errorResponse(404, '模板不存在');
    }
    return jsonResponse({ success: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '删除失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
