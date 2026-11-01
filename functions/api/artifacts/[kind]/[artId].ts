import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  assertCampaignWrite,
  jsonResponse,
  handleOptions,
  readJsonBody,
  now,
} from '../../../_utils';

// 与列表端点保持同一白名单
const ARTIFACT_KINDS = ['combat', 'treasure', 'note', 'battleground', 'calendar', 'gametime', 'proposal'];

function checkKind(kind: string): Response | null {
  return ARTIFACT_KINDS.includes(kind) ? null : errorResponse(400, `未知的制品种类: ${kind}`);
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;
  const kind = String(params.kind || '');
  const artId = String(params.artId || '');
  const kindError = checkKind(kind);
  if (kindError) return kindError;
  if (!artId) {
    return errorResponse(400, '缺少制品 id');
  }
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const ctx = await getCampaignContext(request, env, auth);
  // kind=proposal 放行普通成员写入（玩家提案通道），其余种类仅 DM/站点管理员
  if (!ctx || !assertCampaignWrite(ctx, auth, kind)) {
    return errorResponse(403, '需要团组 DM 权限');
  }
  const body = await readJsonBody(request);
  if (!body) {
    return errorResponse(400, '请求体为空');
  }
  const timestamp = now();
  const payload = { ...body, id: artId, updatedAt: timestamp };
  try {
    await env.DB
      .prepare(
        `INSERT INTO campaign_artifacts (id, campaign_id, kind, user_id, data, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (campaign_id, kind, id) DO UPDATE SET data = excluded.data, user_id = excluded.user_id, updated_at = excluded.updated_at`
      )
      .bind(artId, ctx.campaignId, kind, auth.sub, JSON.stringify(payload), timestamp)
      .run();
    return jsonResponse(payload);
  } catch (e: any) {
    return errorResponse(500, e.message || '保存失败');
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;
  const kind = String(params.kind || '');
  const artId = String(params.artId || '');
  const kindError = checkKind(kind);
  if (kindError) return kindError;
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !assertCampaignWrite(ctx, auth, kind)) {
    return errorResponse(403, '需要团组 DM 权限');
  }
  try {
    const result = await env.DB
      .prepare('DELETE FROM campaign_artifacts WHERE campaign_id = ? AND kind = ? AND id = ?')
      .bind(ctx.campaignId, kind, artId)
      .run();
    if (result.meta.changes === 0) {
      return errorResponse(404, '制品不存在');
    }
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '删除失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
