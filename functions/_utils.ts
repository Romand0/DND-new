// functions/_utils.ts

export interface Env {
  DB: D1Database;
  DM_TOKEN: string;
  JWT_SECRET: string;
}

// ---------- HTTP 响应工具 ----------

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

export function handleOptions(request: Request): Response {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  return new Response(null, { status: 405 });
}

// ---------- DM Token 验证（兼容旧逻辑） ----------

export function verifyDmToken(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === env.DM_TOKEN;
}

// ---------- 统一认证（JWT 优先，DM_TOKEN 兜底） ----------
// 用于写端点（POST/PUT/DELETE），兼容账号系统 JWT 和超级管理员 DM_TOKEN

export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<{ sub: string; role: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  // 先试 JWT
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    return await verifyJwt(token, jwtSecret);
  } catch {
    // JWT 失败，继续试 DM_TOKEN
  }

  // 再试 DM_TOKEN
  if (token === env.DM_TOKEN) {
    return { sub: 'dm-token-user', role: 'dm' };
  }

  return null;
}

// ---------- JWT 工具 ----------

export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
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

export async function verifyJwt(token: string, secret: string): Promise<{ sub: string; role: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, signatureB64] = parts;

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

  const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  
  const now = Math.floor(Date.now() / 1000);
  if (payloadJson.exp && payloadJson.exp < now) {
    throw new Error('Token expired');
  }

  return { sub: payloadJson.sub, role: payloadJson.role };
}

// ---------- 密码工具 ----------

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const salted = new Uint8Array([...salt, ...encoder.encode(password)]);
  const hashBuffer = await crypto.subtle.digest('SHA-256', salted);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const salted = new Uint8Array([...salt, ...encoder.encode(password)]);

  const hashBuffer = await crypto.subtle.digest('SHA-256', salted);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return computedHash === hashHex;
}
// ---------- 请求体解析工具 ----------

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

export function now(): number {
  return Date.now();
}

// ---------- Base64 URL 工具 ----------

function base64UrlEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
