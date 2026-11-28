// DM 投送当前观战战斗：按收件人 upsert 到 table_spectate_presence（每人同时只处于一场）。
// 玩家端不再接收逐条邀请消息，只查询自己当前所在房间；切换战斗即覆盖旧房间。
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

  // 同一 DM 对同一房间重发：先清空旧名单，再按最新收件人重建
  await env.DB
    .prepare('DELETE FROM table_spectate_presence WHERE from_user_id = ? AND room_id = ?')
    .bind(auth.sub, roomId)
    .run();

  const upsert = env.DB.prepare(
    `INSERT INTO table_spectate_presence
       (user_id, campaign_id, room_id, title, from_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       campaign_id = excluded.campaign_id,
       room_id = excluded.room_id,
       title = excluded.title,
       from_user_id = excluded.from_user_id,
       updated_at = excluded.updated_at`
  );
  await env.DB.batch(
    recipients.map((uid) =>
      upsert.bind(uid, campaignId || null, roomId, title, auth.sub, ts, ts)
    )
  );

  return jsonResponse({ ok: true, recipients: recipients.length, roomId });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
