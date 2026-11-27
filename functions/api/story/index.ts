import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
  readJsonBody,
} from '../../_utils';
import {
  STORY_KIND,
  normalizeArc,
  validateArc,
  collectSceneIds,
  collectCharacterIds,
  projectArcsForViewer,
} from './_shared';

async function loadArcs(env: any, campaignId: string) {
  const result = await env.DB
    .prepare('SELECT id, data, updated_at FROM campaign_artifacts WHERE campaign_id = ? AND kind = ?')
    .bind(campaignId, STORY_KIND)
    .all();
  return (result.results || [])
    .map((row: any) => {
      try {
        const parsed = JSON.parse(row.data);
        if (parsed && typeof parsed === 'object') {
          parsed.id = row.id;
          parsed.updatedAt = row.updated_at;
        }
        return parsed;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** 校验在场角色属于当前团组；返回不在团组的 id 列表 */
async function findForeignCharacters(env: any, campaignId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const result = await env.DB
    .prepare(`SELECT id FROM characters WHERE campaign_id = ? AND id IN (${placeholders})`)
    .bind(campaignId, ...ids)
    .all();
  const known = new Set((result.results || []).map((r: any) => r.id));
  return ids.filter(id => !known.has(id));
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) return errorResponse(403, '非该团组成员');
  try {
    const arcs = await loadArcs(env, ctx.campaignId);
    const isDm = auth.isAdmin || ctx.role === 'dm';
    return jsonResponse(projectArcsForViewer(arcs, isDm));
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库查询失败');
  }
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !(auth.isAdmin || ctx.role === 'dm')) return errorResponse(403, '需要团组 DM 权限');

  const body = await readJsonBody<any>(request);
  if (!body || !body.arc) return errorResponse(400, '缺少剧情线数据');

  const arc = normalizeArc(body.arc, ctx.campaignId, auth.sub);
  const check = validateArc(arc);
  if (!check.ok) return errorResponse(400, check.error);

  const foreign = await findForeignCharacters(env, ctx.campaignId, collectCharacterIds(arc));
  if (foreign.length) return errorResponse(400, `角色不属于当前团组: ${foreign.join(', ')}`);

  try {
    const existing = await env.DB
      .prepare('SELECT updated_at FROM campaign_artifacts WHERE campaign_id = ? AND kind = ? AND id = ?')
      .bind(ctx.campaignId, STORY_KIND, arc.id)
      .first<{ updated_at: number }>();
    if (existing && typeof body.baseUpdatedAt === 'number' && body.baseUpdatedAt !== existing.updated_at) {
      return errorResponse(409, '剧情已被其他窗口修改，请刷新后重试');
    }
    await env.DB
      .prepare(
        `INSERT INTO campaign_artifacts (id, campaign_id, kind, user_id, data, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (campaign_id, kind, id) DO UPDATE SET data = excluded.data, user_id = excluded.user_id, updated_at = excluded.updated_at`
      )
      .bind(arc.id, ctx.campaignId, STORY_KIND, auth.sub, JSON.stringify(arc), arc.updatedAt)
      .run();
    return jsonResponse(arc);
  } catch (e: any) {
    return errorResponse(500, e.message || '保存失败');
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !(auth.isAdmin || ctx.role === 'dm')) return errorResponse(403, '需要团组 DM 权限');

  const arcId = new URL(request.url).searchParams.get('arcId') || '';
  if (!arcId) return errorResponse(400, '缺少 arcId');

  try {
    const row = await env.DB
      .prepare('SELECT data FROM campaign_artifacts WHERE campaign_id = ? AND kind = ? AND id = ?')
      .bind(ctx.campaignId, STORY_KIND, arcId)
      .first<{ data: string }>();
    if (!row) return errorResponse(404, '剧情线不存在');

    let sceneIds: string[] = [];
    try {
      sceneIds = collectSceneIds(JSON.parse(row.data));
    } catch {
      sceneIds = [];
    }

    // 0017 迁移可能尚未应用：索引清理失败不阻断剧情线删除
    if (sceneIds.length) {
      const placeholders = sceneIds.map(() => '?').join(',');
      try {
        await env.DB
          .prepare(`DELETE FROM story_ledger_links WHERE campaign_id = ? AND scene_id IN (${placeholders})`)
          .bind(ctx.campaignId, ...sceneIds)
          .run();
      } catch {
        // 表不存在时忽略，P2 迁移后可清理历史索引
      }
    }

    const result = await env.DB
      .prepare('DELETE FROM campaign_artifacts WHERE campaign_id = ? AND kind = ? AND id = ?')
      .bind(ctx.campaignId, STORY_KIND, arcId)
      .run();
    if (!result.meta?.changes) return errorResponse(404, '剧情线不存在');
    return jsonResponse({ ok: true, removedScenes: sceneIds.length });
  } catch (e: any) {
    return errorResponse(500, e.message || '删除失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
