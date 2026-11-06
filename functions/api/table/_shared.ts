// functions/api/table/_shared.ts
// 圆桌消息信箱共享类型与校验（前后端各自声明同构常量，避免跨端 import）
import type { Env } from '../../_utils';

export type TableMessageType = 'check_request' | 'check_result';
export type TableMessageStatus = 'pending' | 'answered' | 'cancelled';
export type CheckKind = 'ability' | 'skill' | 'save';
export type DcMode = 'open' | 'hidden_dc' | 'value_only';

export interface TableMessageRow {
  id: string;
  campaign_id: string | null;
  from_user_id: string;
  to_user_id: string;
  type: string;
  payload: string;
  status: string;
  reply_message_id: string | null;
  created_at: number;
  updated_at: number;
}

const CHECK_KINDS: CheckKind[] = ['ability', 'skill', 'save'];
const DC_MODES: DcMode[] = ['open', 'hidden_dc', 'value_only'];

export function isValidCheckKind(v: unknown): v is CheckKind {
  return typeof v === 'string' && CHECK_KINDS.includes(v as CheckKind);
}

export function isValidDcMode(v: unknown): v is DcMode {
  return typeof v === 'string' && DC_MODES.includes(v as DcMode);
}

/** 查某角色卡的绑定账号（最早绑定的账号为准；无绑定返回 null） */
export async function findBoundUserId(env: Env, characterId: string): Promise<string | null> {
  const row = await env.DB
    .prepare(
      `SELECT user_id FROM user_characters WHERE character_id = ?
       ORDER BY created_at ASC LIMIT 1`
    )
    .bind(characterId)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** 校验 user 与 character 的绑定关系是否存在 */
export async function isCharacterBoundTo(env: Env, userId: string, characterId: string): Promise<boolean> {
  const row = await env.DB
    .prepare('SELECT 1 AS ok FROM user_characters WHERE user_id = ? AND character_id = ?')
    .bind(userId, characterId)
    .first<{ ok: number }>();
  return row?.ok === 1;
}

/** 消息行 → API 形状（payload 解析为对象；解析失败保底空对象不炸整个信箱） */
export function toApiMessage(row: TableMessageRow) {
  let payload: unknown = {};
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    campaignId: row.campaign_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    type: row.type,
    payload,
    status: row.status,
    replyMessageId: row.reply_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
