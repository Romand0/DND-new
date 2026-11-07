// DM 抛送观战邀请：写 spectate_invite 消息给当前团所有绑定玩家账号（fan-out）
// 玩家点击后跳 /player/spectate?room=<roomId> 加入实时房间。
// 同 roomId 的旧 pending 邀请在插入前统一置 cancelled（重发即刷新，玩家端不堆积过期邀请）。
// 权限：JWT + isAdmin。
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
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : '';

  if (!roomId || roomId.length > 80) return errorResponse('缺少观战房间号', 400);
  if (!title) return errorResponse('缺少战斗标题', 400);

  // 收件人 = 团内（或全库）绑定过角色卡的玩家账号，去重
  const bindRows = await env.DB
    .prepare(
      `SELECT DISTINCT uc.user_id AS user_id
       FROM user_characters uc
       JOIN characters c ON c.id = uc.character_id
       WHERE (? = '' OR c.campaign_id = ?)`
    )
    .bind(campaignId, campaignId)
    .all<{ user_id: string }>();
  const recipients = (bindRows.results ?? []).map((r) => r.user_id);
  if (recipients.length === 0) return errorResponse('当前团没有绑定角色卡的玩家账号', 400);

  const ts = now();

  // 重发即刷新：同房间的旧 pending 邀请先失效（payload JSON 按 roomId 匹配）
  await env.DB
    .prepare(
      `UPDATE table_messages SET status = 'cancelled', updated_at = ?
       WHERE type = 'spectate_invite' AND status = 'pending'
         AND json_extract(payload, '$.roomId') = ?`
    )
    .bind(ts, roomId)
    .run();

  const insert = env.DB.prepare(
    `INSERT INTO table_messages (id, campaign_id, from_user_id, to_user_id, type, payload, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'spectate_invite', ?, 'pending', ?, ?)`
  );
  const payload = JSON.stringify({ roomId, title });
  await env.DB.batch(
    recipients.map((uid) => insert.bind(crypto.randomUUID(), campaignId || null, auth.sub, uid, payload, ts, ts)),
  );

  return jsonResponse({ ok: true, recipients: recipients.length });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
