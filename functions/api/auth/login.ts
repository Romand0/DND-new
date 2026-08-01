// functions/api/auth/login.ts
import { jsonResponse, errorResponse, verifyPassword, signJwt } from '../../_utils';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { username, password } = body;

  if (!username || !password) {
    return errorResponse(400, 'Username and password are required');
  }

  // 查找用户
  const user = await env.DB.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?')
    .bind(username.trim())
    .first<{ id: string; username: string; password_hash: string; role: string }>();

  if (!user) {
    return errorResponse(401, 'Invalid username or password');
  }

  // 验证密码
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return errorResponse(401, 'Invalid username or password');
  }

  // 生成 JWT 前先打日志
  console.log('JWT_DEBUG:', {
    hasSecret: !!env.JWT_SECRET,
    secretLen: env.JWT_SECRET?.length,
    secretPrefix: env.JWT_SECRET?.substring(0, 3),
    allEnvKeys: Object.keys(env).join(','),
  });

  // 生成 JWT（单独 try/catch，捕捉 JWT_SECRET 缺失或格式问题）
  let token: string;
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907'; // 环境变量没注入时用这个兜底
    token = await signJwt({ sub: user.id, role: user.role }, jwtSecret);
  } catch (e) {
    console.error('signJwt failed:', e);
    return errorResponse(500, 'Token generation failed: ' + (e instanceof Error ? e.message : String(e)));
  }

  // 记录会话：用于账号一览页的登录状态推算（过期时间与 signJwt 的 7 天一致）
  try {
    const exp = Date.now() + 604800 * 1000;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
    const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare(
      'INSERT OR REPLACE INTO sessions (user_id, token_hash, exp, updated_at) VALUES (?, ?, ?, ?)'
    )
      .bind(user.id, tokenHash, exp, Date.now())
      .run();
  } catch (e) {
    console.error('write session failed:', e);
  }

  return jsonResponse({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
};
