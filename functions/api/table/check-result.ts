// 玩家答复检定：写 check_result + 原子回填 request 状态（UPDATE 抢占实现幂等）
// 权限：JWT（登录账号），消息 to_user_id 必须等于当前账号。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now, type Env } from '../../_utils';
import { toApiMessage } from './_shared';

interface EnvWithDb extends Env {
  DB: D1Database;
}

export async function onRequestPost(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);

  const body = await readJsonBody(request);
  if (!body) return errorResponse('请求体无效', 400);

  const replyTo = typeof body.replyTo === 'string' ? body.replyTo.trim() : '';
  if (!replyTo) return errorResponse('缺少 replyTo', 400);

  const d20s = Array.isArray(body.d20s)
    ? body.d20s.filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 20)
    : [];
  if (d20s.length === 0) return errorResponse('缺少有效 d20 结果', 400);
  const d20Kept = typeof body.d20Kept === 'number' && Number.isFinite(body.d20Kept) ? Math.trunc(body.d20Kept) : Math.max(...d20s);
  const rollMode = body.rollMode === 'advantage' || body.rollMode === 'disadvantage' ? body.rollMode : 'none';
  const modeReasons = Array.isArray(body.modeReasons)
    ? body.modeReasons.filter((s: unknown): s is string => typeof s === 'string').slice(0, 10)
    : [];
  const bonuses = Array.isArray(body.bonuses)
    ? body.bonuses
        .filter((b: any) => b && typeof b === 'object' && typeof b.label === 'string' && typeof b.value === 'number' && Number.isFinite(b.value))
        .slice(0, 20)
        .map((b: any) => ({ label: String(b.label).slice(0, 60), value: Math.trunc(b.value) }))
    : [];
  const appliedValue = typeof body.appliedValue === 'number' && Number.isFinite(body.appliedValue)
    ? Math.trunc(body.appliedValue)
    : d20Kept + bonuses.reduce((s: number, b: { value: number }) => s + b.value, 0);
  const autoOutcome = body.autoOutcome === 'success' || body.autoOutcome === 'fail' ? body.autoOutcome : null;

  const ts = now();
  const resultId = crypto.randomUUID();

  // 读原消息确定回执方向（to = request 的发起方）与作用域
  const requestRow = await env.DB
    .prepare('SELECT * FROM table_messages WHERE id = ?')
    .bind(replyTo)
    .first<any>();
  if (!requestRow) return errorResponse('检定任务不存在', 404);
  if (requestRow.to_user_id !== auth.sub) return errorResponse('该检定任务属于其他账号', 403);

  const resultPayload = JSON.stringify({ replyTo, d20s, d20Kept, rollMode, modeReasons, bonuses, appliedValue, autoOutcome, submittedAt: ts });

  // batch 原子执行：UPDATE 抢占（status='pending' 条件保证幂等）+ INSERT 回执
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
         VALUES (?, ?, ?, ?, 'check_result', ?, 'answered', ?, ?)`
      )
      .bind(resultId, requestRow.campaign_id, auth.sub, requestRow.from_user_id, resultPayload, ts, ts),
  ];

  const results = await env.DB.batch(statements);
  const updated = results[0]?.meta?.changes ?? 0;
  if (updated === 0) {
    const status = requestRow.status;
    if (status === 'answered') return errorResponse('该检定已答复', 409);
    if (status === 'cancelled') return errorResponse('任务已被 DM 撤回', 409);
    return errorResponse('该检定已处理，无法重复答复', 409);
  }

  return jsonResponse({ ok: true, id: resultId, request: toApiMessage({ ...requestRow, status: 'answered', reply_message_id: resultId, updated_at: ts }) });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
