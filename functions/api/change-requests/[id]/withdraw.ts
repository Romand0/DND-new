// 玩家撤回自己的待审变更请求：仅 pending 可撤，终态请求不可变更。

import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  now,
} from '../../../_utils';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env, params } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }

  const id = params?.id;
  if (!id) return errorResponse(400, '缺少请求 id');

  try {
    const row = await env.DB
      .prepare('SELECT requester_id, status FROM character_change_requests WHERE id = ?')
      .bind(id)
      .first<{ requester_id: string; status: string }>();
    if (!row) return errorResponse(404, '变更请求不存在');
    if (row.requester_id !== auth.sub) return errorResponse(403, '仅请求者本人可撤回');
    if (row.status !== 'pending') return errorResponse(409, '该请求已被处理，无法撤回');

    await env.DB
      .prepare("UPDATE character_change_requests SET status = 'withdrawn', reviewed_at = ? WHERE id = ?")
      .bind(now(), id)
      .run();
    return jsonResponse({ id, status: 'withdrawn' });
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库操作失败');
  }
}
