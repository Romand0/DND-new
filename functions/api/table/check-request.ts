// DM 发起检定任务：写一条 check_request 消息（定向投给角色绑定账号）
// 权限：JWT + isAdmin（站点管理员）。目标角色必须已绑定玩家账号。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now, type Env } from '../../_utils';
import { isValidCheckKind, isValidDcMode, findBoundUserId, type CheckKind, type DcMode } from './_shared';

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

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const checkKind = body.checkKind;
  const checkKey = typeof body.checkKey === 'string' ? body.checkKey.trim() : '';
  const checkLabel = typeof body.checkLabel === 'string' ? body.checkLabel.trim() : '';
  const dc = body.dc;
  const dcMode = body.dcMode;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

  if (!characterId) return errorResponse('缺少目标角色卡', 400);
  if (!isValidCheckKind(checkKind)) return errorResponse('检定类型无效', 400);
  if (!checkKey || !checkLabel) return errorResponse('缺少检定项', 400);
  if (typeof dc !== 'number' || !Number.isFinite(dc) || dc < 1 || dc > 30) return errorResponse('DC 需为 1-30 的数值', 400);
  if (!isValidDcMode(dcMode)) return errorResponse('DC 可见性模式无效', 400);

  const toUserId = await findBoundUserId(env, characterId);
  if (!toUserId) return errorResponse('该角色卡未绑定玩家账号，无法抛送检定', 400);

  const charRow = await env.DB
    .prepare('SELECT name, campaign_id FROM characters WHERE id = ?')
    .bind(characterId)
    .first<{ name: string; campaign_id: string | null }>();
  if (!charRow) return errorResponse('角色卡不存在', 404);

  const ts = now();
  const id = crypto.randomUUID();
  const payload = JSON.stringify({
    characterId,
    characterName: charRow.name || '未命名',
    checkKind: checkKind as CheckKind,
    checkKey,
    checkLabel,
    dc,
    dcMode: dcMode as DcMode,
    note,
  });

  await env.DB
    .prepare(
      `INSERT INTO table_messages (id, campaign_id, from_user_id, to_user_id, type, payload, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'check_request', ?, 'pending', ?, ?)`
    )
    .bind(id, charRow.campaign_id, auth.sub, toUserId, payload, ts, ts)
    .run();

  return jsonResponse({ ok: true, id });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
