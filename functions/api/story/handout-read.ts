// 道具阅读状态：标记已读 / 收藏。已读时间单调，收藏与已读独立。
import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
  readJsonBody,
  now,
} from '../../_utils';
import { canViewHandout, projectHandoutRow } from './_shared';

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) return errorResponse(403, '非该团组成员');

  const body = await readJsonBody<any>(request);
  const handoutId = typeof body?.handoutId === 'string' ? body.handoutId : '';
  if (!handoutId) return errorResponse(400, '缺少 handoutId');

  try {
    const row = await env.DB
      .prepare('SELECT * FROM story_handouts WHERE campaign_id = ? AND id = ?')
      .bind(ctx.campaignId, handoutId)
      .first<any>();
    if (!row) return errorResponse(404, '道具不存在');

    const isDm = auth.isAdmin || ctx.role === 'dm';
    const handout = projectHandoutRow(row);
    if (!canViewHandout(handout, auth.sub, isDm)) return errorResponse(404, '道具不存在');

    const ts = now();
    const markRead = body?.read !== false;
    const setFavorited = typeof body?.favorited === 'boolean';
    const favoritedAt = setFavorited ? (body.favorited ? ts : null) : null;

    await env.DB
      .prepare(
        `INSERT INTO story_handout_reads (handout_id, user_id, read_at, favorited_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (handout_id, user_id) DO UPDATE SET
           read_at = CASE
             WHEN story_handout_reads.read_at > 0 THEN story_handout_reads.read_at
             WHEN excluded.read_at > 0 THEN excluded.read_at
             ELSE story_handout_reads.read_at
           END,
           favorited_at = CASE
             WHEN ? = 1 THEN excluded.favorited_at
             ELSE story_handout_reads.favorited_at
           END`
      )
      .bind(handoutId, auth.sub, markRead ? ts : 0, favoritedAt, setFavorited ? 1 : 0)
      .run();

    const saved = await env.DB
      .prepare('SELECT read_at, favorited_at FROM story_handout_reads WHERE handout_id = ? AND user_id = ?')
      .bind(handoutId, auth.sub)
      .first<any>();
    return jsonResponse({
      handoutId,
      userId: auth.sub,
      readAt: Number(saved?.read_at ?? 0),
      ...(saved?.favorited_at ? { favoritedAt: Number(saved.favorited_at) } : {}),
    });
  } catch (e: any) {
    return errorResponse(500, e.message || '阅读状态保存失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
