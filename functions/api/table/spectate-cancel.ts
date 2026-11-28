// DM 结束战斗投送：清除该房间的当前名单（不保留历史记录）。
// 权限：JWT + isAdmin，且只能结束自己投送的房间。
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

  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  if (!roomId) return errorResponse('缺少观战房间号', 400);

  const result = await env.DB
    .prepare('DELETE FROM table_spectate_presence WHERE room_id = ? AND from_user_id = ?')
    .bind(roomId, auth.sub)
    .run();

  // 顺带清掉旧版逐条邀请（升级前的 pending 消息），避免旧客户端继续展示
  await env.DB
    .prepare(
      `UPDATE table_messages SET status = 'cancelled', updated_at = ?
       WHERE type = 'spectate_invite' AND status = 'pending'
         AND from_user_id = ? AND json_extract(payload, '$.roomId') = ?`
    )
    .bind(now(), auth.sub, roomId)
    .run();

  return jsonResponse({ ok: true, removed: result.meta?.changes ?? 0 });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
