// functions/api/upload/avatar.ts
// 头像上传：写入 R2 对象存储，返回公开 URL
import { jsonResponse, errorResponse, handleOptions, verifyJwt } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  AVATAR_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function extForContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Invalid or expired token');
  }
  let payload: { sub: string; role: string };
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    payload = await verifyJwt(authHeader.slice(7), jwtSecret);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  if (!env.AVATAR_BUCKET) {
    return errorResponse(500, '头像存储未配置');
  }
  if (!env.R2_PUBLIC_URL) {
    return errorResponse(500, '头像公开域名未配置（R2_PUBLIC_URL）');
  }

  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  if (!contentType.includes('image/')) {
    return errorResponse(400, '仅支持图片文件');
  }
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_SIZE) {
    return errorResponse(400, '图片大小不能超过 2MB');
  }

  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) {
      return errorResponse(400, '图片内容为空');
    }
    if (bytes.byteLength > MAX_SIZE) {
      return errorResponse(400, '图片大小不能超过 2MB');
    }

    const ext = extForContentType(contentType);
    const key = `avatars/${payload.sub}-${Date.now()}.${ext}`;
    await env.AVATAR_BUCKET.put(key, bytes, {
      httpMetadata: { contentType },
    });

    return jsonResponse({ url: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}` });
  } catch (e: any) {
    return errorResponse(500, e.message || '上传失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
