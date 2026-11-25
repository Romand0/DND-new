// 回合中途决策点裁定：DM 回填结果（批准/驳回 + 理由）→ 玩家端恢复操作
// 权限：JWT + isAdmin，且 request 的 to_user_id 必须等于当前账号、状态为 pending。
// 与 check-result 同构：batch 原子执行「UPDATE 抢占 + INSERT 回执」。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now, type Env } from '../../_utils';
import type { DecisionResultPayload } from './_shared';

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

  const replyTo = typeof body.replyTo === 'string' ? body.replyTo.trim() : '';
  const approved = body.approved;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  if (!replyTo) return errorResponse('缺少 replyTo', 400);
  if (typeof approved !== 'boolean') return errorResponse('裁定结果无效', 400);

  const requestRow = await env.DB
    .prepare(
      `SELECT id, campaign_id, from_user_id, to_user_id, status, type
       FROM table_messages WHERE id = ?`
    )
    .bind(replyTo)
    .first<{
      id: string;
      campaign_id: string | null;
      from_user_id: string;
      to_user_id: string;
      status: string;
      type: string;
    }>();
  if (!requestRow) return errorResponse('决策请求不存在', 404);
  if (requestRow.type !== 'decision_request') return errorResponse('消息类型不符', 400);
  if (requestRow.to_user_id !== auth.sub) return errorResponse('只能裁定发给自己的决策请求', 403);
  if (requestRow.status !== 'pending') return errorResponse('决策请求已处理', 409);

  const ts = now();
  const resultId = crypto.randomUUID();
  const resultPayload: DecisionResultPayload = {
    replyTo,
    approved,
    ...(reason ? { reason } : {}),
    submittedAt: ts,
  };

  const statements = [
    env.DB
      .prepare(
        `UPDATE table_messages SET status = 'answered', reply_message_id = ?, updated_at = ?
         WHERE id = ? AND to_user_id = ? AND status = 'pending'`
      )
      .bind(resultId, ts, replyTo, auth.sub),
    env.DB
      .prepare(
        `INSERT INTO table_messages (id, campaign_id, from_user_id, to_user_id, type, payload, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'decision_result', ?, 'answered', ?, ?)`
      )
      .bind(resultId, requestRow.campaign_id, auth.sub, requestRow.from_user_id, JSON.stringify(resultPayload), ts, ts),
  ];

  const results = await env.DB.batch(statements);
  const updated = results[0]?.meta?.changes ?? 0;
  if (updated === 0) return errorResponse('决策请求已被处理', 409);

  return jsonResponse({ ok: true, id: resultId });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
