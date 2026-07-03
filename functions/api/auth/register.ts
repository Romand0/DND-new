import { jsonResponse, errorResponse, hashPassword, signJwt } from '../../_utils';

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

  // 提前校验 JWT_SECRET，避免插库后 signJwt 崩导致脏数据
  const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
  if (!env.JWT_SECRET) {
    console.warn('[register] JWT_SECRET not set in env, using fallback');
  }

  // 哈希密码
  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const now = Date.now();

  // 插入新用户
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(userId, username.trim(), passwordHash, finalRole, now)
    .run();

  // 生成 JWT
  const token = await signJwt({ sub: userId, role: finalRole }, jwtSecret);

  return jsonResponse({
    token,
    user: { id: userId, username: username.trim(), role: finalRole },
  });
};
