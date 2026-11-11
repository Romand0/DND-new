// DM 驳回变更请求：理由必填，回传玩家可见；正式卡保持不变。

import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  getCampaignContext,
} from '../../../_utils';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env, params } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) {
    return errorResponse(403, '非该团组成员');
  }
  const isDm = auth.isAdmin || ctx.role === 'dm';
  if (!isDm) {
    return errorResponse(403, '需要团组 DM 权限');
  }

  const id = params?.id;
  if (!id) return errorResponse(400, '缺少请求 id');

  const body = await readJsonBody(request);
  const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.trim().slice(0, 2000) : '';
  if (!reviewNote) return errorResponse(400, '驳回理由必填');

  try {
    const row = await env.DB
      .prepare('SELECT campaign_id, status FROM character_change_requests WHERE id = ?')
      .bind(id)
      .first<{ campaign_id: string; status: string }>();
    if (!row) return errorResponse(404, '变更请求不存在');
    if (row.campaign_id !== ctx.campaignId) return errorResponse(404, '变更请求不属于当前团组');
    if (row.status !== 'pending') return errorResponse(409, '该请求已被处理');

    await env.DB
      .prepare("UPDATE character_change_requests SET status = 'rejected', review_note = ?, reviewer_id = ?, reviewed_at = ? WHERE id = ?")
      .bind(reviewNote, auth.sub, now(), id)
      .run();
    return jsonResponse({ id, status: 'rejected', reviewNote });
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库操作失败');
  }
}
