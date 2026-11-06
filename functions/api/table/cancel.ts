// DM 撤回检定任务：pending → cancelled（不可逆，玩家端停止展示）
// 权限：JWT + isAdmin，且消息 from_user_id 必须等于当前账号。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now, type Env } from '../../_utils';

interface EnvWithDb extends Env {
  DB: D1Database;
}

export async function onRequestPost(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);
  if (!auth.isAdmin) return errorResponse('需要管理员权限', 403);

  const body = await readJsonBody(request);
  if (!body) return errorResponse('请求体无效', 400);

  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
  if (!messageId) return errorResponse('缺少 messageId', 400);

  const result = await env.DB
    .prepare(
      `UPDATE table_messages SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND from_user_id = ? AND status = 'pending'`
    )
    .bind(now(), messageId, auth.sub)
    .run();

  const updated = result.meta?.changes ?? 0;
  if (updated === 0) return errorResponse('任务不存在或已处理', 409);

  return jsonResponse({ ok: true });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
