// functions/api/upload/avatar.ts
// 头像上传：接收前端压缩后的 base64 data URL，校验后返回（由 PATCH /auth/me 写入 D1）
import { jsonResponse, errorResponse, handleOptions, verifyJwt, readJsonBody } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const MAX_DATA_URL_LENGTH = 800_000; // base64 字符串上限（约 600KB，对应压缩后的 256px 头像绰绰有余）

const IMAGE_DATA_URL_RE = /^data:image\/(jpeg|png|webp|gif);base64,/;

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Invalid or expired token');
  }
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    await verifyJwt(authHeader.slice(7), jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  const body = await readJsonBody<{ dataUrl?: string }>(request);
  if (!body || typeof body.dataUrl !== 'string' || body.dataUrl.length === 0) {
    return errorResponse(400, '缺少图片数据');
  }
  if (!IMAGE_DATA_URL_RE.test(body.dataUrl)) {
    return errorResponse(400, '仅支持 jpeg/png/webp/gif 图片');
  }
  if (body.dataUrl.length > MAX_DATA_URL_LENGTH) {
    return errorResponse(400, '图片数据过大');
  }

  return jsonResponse({ url: body.dataUrl });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
