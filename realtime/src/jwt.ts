// JWT 验签（与 functions/_utils.ts 同算法，触发同步修改时两处一起改）
// 独立 Worker 无法 import Pages Functions 目录，故复制最小实现。

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export interface JwtPayload {
  sub: string;
  role: string;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
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
    ['verify'],
  );
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signatureB64),
    encoder.encode(signatureInput),
  );
  if (!isValid) throw new Error('Invalid signature');

  const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  const now = Math.floor(Date.now() / 1000);
  if (payloadJson.exp && payloadJson.exp < now) throw new Error('Token expired');

  return { sub: payloadJson.sub, role: payloadJson.role };
}
