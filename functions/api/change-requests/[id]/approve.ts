// DM 批准变更请求：以请求快照为准写入正式角色卡，置 approved。
// 正式卡在提交后被 DM 改过（updated_at !== base_updated_at）时不阻断，响应带 versionDrift 提示。

import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
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

  try {
    const row = await env.DB
      .prepare('SELECT campaign_id, character_id, payload, status FROM character_change_requests WHERE id = ?')
      .bind(id)
      .first<{ campaign_id: string; character_id: string; payload: string; status: string }>();
    if (!row) return errorResponse(404, '变更请求不存在');
    if (row.campaign_id !== ctx.campaignId) return errorResponse(404, '变更请求不属于当前团组');
    if (row.status !== 'pending') return errorResponse(409, '该请求已被处理');

    // 正式卡版本比对（漂移提示，不阻断——决策权在 DM，前端已提前警告）
    const charRow = await env.DB
      .prepare('SELECT updated_at FROM characters WHERE id = ?')
      .bind(row.character_id)
      .first<{ updated_at: number }>();
    const baseRow = await env.DB
      .prepare('SELECT base_updated_at FROM character_change_requests WHERE id = ?')
      .bind(id)
      .first<{ base_updated_at: number }>();
    const versionDrift = !!charRow && !!baseRow && charRow.updated_at !== baseRow.base_updated_at;

    const payload = JSON.parse(row.payload);
    const ts = now();
    // 快照回写 createdAt/updatedAt 保持表内一致（updatedAt 变更让其他端感知漂移）
    payload.updatedAt = ts;

    await env.DB.batch([
      env.DB
        .prepare(
          'UPDATE characters SET data = ?, name = ?, class = ?, level = ?, race = ?, updated_at = ? WHERE id = ?'
        )
        .bind(
          JSON.stringify(payload),
          payload.name || '',
          payload.class || '',
          payload.level || 1,
          payload.race || '',
          ts,
          row.character_id,
        ),
      env.DB
        .prepare("UPDATE character_change_requests SET status = 'approved', reviewer_id = ?, reviewed_at = ? WHERE id = ?")
        .bind(auth.sub, ts, id),
    ]);

    return jsonResponse({ id, status: 'approved', versionDrift, character: payload });
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库操作失败');
  }
}
