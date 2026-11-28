// 道具投送：DM 创建/撤回。空目标=全团，零已读才允许撤回。
import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
  readJsonBody,
  now,
} from '../../_utils';
import {
  STORY_KIND,
  collectSceneIds,
  normalizeHandout,
  validateHandout,
  canRecallHandout,
  projectHandoutRow,
} from './_shared';

async function sceneBelongsToCampaign(env: any, campaignId: string, sceneId: string): Promise<boolean> {
  const result = await env.DB
    .prepare('SELECT data FROM campaign_artifacts WHERE campaign_id = ? AND kind = ?')
    .bind(campaignId, STORY_KIND)
    .all();
  for (const row of result.results || []) {
    try {
      if (collectSceneIds(JSON.parse(row.data)).includes(sceneId)) return true;
    } catch {
      // 损坏数据跳过
    }
  }
  return false;
}

async function foreignTargets(env: any, campaignId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => '?').join(',');
  const result = await env.DB
    .prepare(`SELECT user_id FROM campaign_members WHERE campaign_id = ? AND user_id IN (${placeholders})`)
    .bind(campaignId, ...userIds)
    .all();
  const known = new Set((result.results || []).map((r: any) => r.user_id));
  return userIds.filter(id => !known.has(id));
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !(auth.isAdmin || ctx.role === 'dm')) return errorResponse(403, '需要团组 DM 权限');

  const body = await readJsonBody<any>(request);
  if (!body) return errorResponse(400, '请求体为空');

  const ts = now();
  const handout = normalizeHandout(body, ctx.campaignId, auth.sub, ts);
  const check = validateHandout(handout);
  if (!check.ok) return errorResponse(400, check.error);

  try {
    if (handout.sceneId && !(await sceneBelongsToCampaign(env, ctx.campaignId, handout.sceneId))) {
      return errorResponse(400, '场景不存在或不属于当前团组');
    }
    const foreign = await foreignTargets(env, ctx.campaignId, handout.targetUserIds);
    if (foreign.length) return errorResponse(400, `目标玩家不属于当前团组: ${foreign.join(', ')}`);

    const data = {
      title: handout.title,
      body: handout.body,
      ...(handout.imageUrl ? { imageUrl: handout.imageUrl } : {}),
    };
    await env.DB
      .prepare(
        `INSERT INTO story_handouts
         (id, campaign_id, scene_id, kind, target_user_ids, data, created_by, created_at, recalled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        handout.id,
        ctx.campaignId,
        handout.sceneId ?? null,
        handout.kind,
        JSON.stringify(handout.targetUserIds),
        JSON.stringify(data),
        auth.sub,
        ts
      )
      .run();

    return jsonResponse(
      projectHandoutRow({
        id: handout.id,
        campaign_id: ctx.campaignId,
        scene_id: handout.sceneId ?? null,
        kind: handout.kind,
        target_user_ids: JSON.stringify(handout.targetUserIds),
        data: JSON.stringify(data),
        created_by: auth.sub,
        created_at: ts,
        recalled_at: null,
      }),
      201
    );
  } catch (e: any) {
    return errorResponse(500, e.message || '道具投送失败');
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !(auth.isAdmin || ctx.role === 'dm')) return errorResponse(403, '需要团组 DM 权限');

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return errorResponse(400, '缺少 id');

  try {
    const row = await env.DB
      .prepare('SELECT id, recalled_at FROM story_handouts WHERE campaign_id = ? AND id = ?')
      .bind(ctx.campaignId, id)
      .first<any>();
    if (!row) return errorResponse(404, '道具不存在');
    if (row.recalled_at) return jsonResponse({ ok: true, recalledAt: Number(row.recalled_at) });

    const readRow = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM story_handout_reads WHERE handout_id = ? AND read_at > 0')
      .bind(id)
      .first<{ n: number }>();
    const readCount = Number(readRow?.n ?? 0);
    if (!canRecallHandout(readCount)) {
      return jsonResponse({ error: '已有玩家阅读，无法撤回，请发送更正道具', readCount }, 409);
    }

    const ts = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM story_handout_reads WHERE handout_id = ?').bind(id),
      env.DB
        .prepare('UPDATE story_handouts SET recalled_at = ? WHERE campaign_id = ? AND id = ?')
        .bind(ts, ctx.campaignId, id),
    ]);
    return jsonResponse({ ok: true, recalledAt: ts });
  } catch (e: any) {
    return errorResponse(500, e.message || '撤回失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
