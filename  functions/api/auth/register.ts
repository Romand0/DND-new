// functions/api/auth/register.ts
import { jsonResponse, errorResponse } from '../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  let body: { username?: string; password?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { username, password, role } = body;

  // 验证输入
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return errorResponse(400, 'Username must be at least 2 characters');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return errorResponse(400, 'Password must be at least 6 characters');
  }
  const validRoles = ['dm', 'player'];
  const finalRole = role && validRoles.includes(role) ? role : 'player';

  // 检查用户名是否已存在
  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(username.trim())
    .first();
  if (existing) {
    return errorResponse(409, 'Username already exists');
  }

  // 哈希密码（使用 Web Crypto API，无需额外依赖）
  const passwordHash = await hashPassword(password);

  // 生成用户 ID
  const userId = crypto.randomUUID();

  // 插入新用户
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(userId, username.trim(), passwordHash, finalRole, now)
    .run();

  // 生成 JWT
  const token = await signJwt({ sub: userId, role: finalRole }, env.JWT_SECRET);

  return jsonResponse({
    token,
    user: { id: userId, username: username.trim(), role: finalRole },
  });
};

// ---------- 工具函数（后续会移至 _utils.ts） ----------

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const salted = new Uint8Array([...salt, ...encoder.encode(password)]);
  const hashBuffer = await crypto.subtle.digest('SHA-256', salted);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`; // 格式：salt:hash
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + 604800 }; // 7天有效期

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

  const signatureInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureInput));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${signatureInput}.${signatureB64}`;
}

function base64UrlEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
