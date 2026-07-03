// functions/api/auth/me.ts
import { errorResponse } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return errorResponse(405, 'Method not allowed');
  }

  // 从 Authorization 头提取 Token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const token = authHeader.slice(7);

  // 验证 Token 并解析 payload
  let payload: { sub: string; role: string };
  try {
    payload = await verifyJwt(token, env.JWT_SECRET);
  } catch {
    return errorResponse(401, 'Invalid or expired token');
  }

  // 从数据库查询用户
  const user = await env.DB.prepare(
    'SELECT id, username, role, created_at FROM users WHERE id = ?'
  )
    .bind(payload.sub)
    .first<{ id: string; username: string; role: string; created_at: number }>();

  if (!user) {
    return errorResponse(404, 'User not found');
  }

  // 返回用户信息
  return new Response(JSON.stringify({ user }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// ---------- JWT 验证函数（后续统一移到 _utils.ts） ----------

async function verifyJwt(token: string, secret: string): Promise<{ sub: string; role: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, signatureB64] = parts;

  // 验证签名
  const encoder = new TextEncoder();
  const signatureInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const expectedSignature = base64UrlDecode(signatureB64);
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    expectedSignature,
    encoder.encode(signatureInput)
  );
  if (!isValid) throw new Error('Invalid signature');

  // 解析 payload
  const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  
  // 检查过期
  const now = Math.floor(Date.now() / 1000);
  if (payloadJson.exp && payloadJson.exp < now) {
    throw new Error('Token expired');
  }

  return { sub: payloadJson.sub, role: payloadJson.role };
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
