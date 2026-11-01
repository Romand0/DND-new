import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
} from '../../../_utils';

// 六类纯本地数据的云端制品种类；proposal 为玩家提案通道（R5b 预留，本期只存不审）
const ARTIFACT_KINDS = ['combat', 'treasure', 'note', 'battleground', 'calendar', 'gametime', 'proposal'];

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;
  const kind = String(params.kind || '');
  if (!ARTIFACT_KINDS.includes(kind)) {
    return errorResponse(400, `未知的制品种类: ${kind}`);
  }
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) {
    return errorResponse(403, '非该团组成员');
  }
  try {
    const result = await env.DB
      .prepare('SELECT id, data, user_id, updated_at FROM campaign_artifacts WHERE campaign_id = ? AND kind = ?')
      .bind(ctx.campaignId, kind)
      .all();
    const items = result.results.map((row: any) => {
      const parsed = JSON.parse(row.data);
      if (parsed && typeof parsed === 'object') {
        parsed.id = row.id;
        parsed.userId = row.user_id ?? undefined;
        parsed.updatedAt = row.updated_at;
      }
      return parsed;
    });
    return jsonResponse(items);
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库查询失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
