// 回合中途决策点请求：玩家发起 → 定向投给团组 DM（信箱即时送达）
// 权限：登录 + 角色卡必须绑定当前账号（防冒名）。
// 首个使用方：躲藏（decisionKind='hide'）。决策结果由 DM 走 decision-result 回填。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now, type Env } from '../../_utils';
import { findDmUserId, isCharacterBoundTo, type DecisionRequestPayload } from './_shared';

interface EnvWithDb extends Env {
  DB: D1Database;
}

const DECISION_KINDS = ['hide'] as const;
type DecisionKind = (typeof DECISION_KINDS)[number];

function isValidDecisionKind(v: unknown): v is DecisionKind {
  return typeof v === 'string' && (DECISION_KINDS as readonly string[]).includes(v);
}

export async function onRequestPost(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);

  const body = await readJsonBody(request);
  if (!body) return errorResponse('请求体无效', 400);

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const decisionKind = body.decisionKind;
  const decisionLabel = typeof body.decisionLabel === 'string' ? body.decisionLabel.trim().slice(0, 100) : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

  if (!characterId) return errorResponse('缺少角色卡', 400);
  if (!isValidDecisionKind(decisionKind)) return errorResponse('决策类型无效', 400);
  if (!decisionLabel) return errorResponse('缺少决策标签', 400);

  const bound = await isCharacterBoundTo(env, auth.sub, characterId);
  if (!bound) return errorResponse('只能以自己的角色卡发起决策请求', 403);

  const charRow = await env.DB
    .prepare('SELECT name, campaign_id FROM characters WHERE id = ?')
    .bind(characterId)
    .first<{ name: string; campaign_id: string | null }>();
  if (!charRow) return errorResponse('角色卡不存在', 404);

  const toUserId = await findDmUserId(env, charRow.campaign_id);
  if (!toUserId) return errorResponse('未找到 DM 账号，无法提交决策请求', 400);

  const ts = now();
  const id = crypto.randomUUID();
  const payload: DecisionRequestPayload = {
    characterId,
    characterName: charRow.name || '未命名',
    decisionKind,
    decisionLabel,
    note,
    ...(charRow.campaign_id ? { campaignId: charRow.campaign_id } : {}),
  };

  await env.DB
    .prepare(
      `INSERT INTO table_messages (id, campaign_id, from_user_id, to_user_id, type, payload, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'decision_request', ?, 'pending', ?, ?)`
    )
    .bind(id, charRow.campaign_id, auth.sub, toUserId, JSON.stringify(payload), ts, ts)
    .run();

  return jsonResponse({ ok: true, id });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
