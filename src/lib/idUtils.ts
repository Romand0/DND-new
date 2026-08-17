/** 生成 URL-safe 随机 ID 前缀，如 "f-a3x9k2" */
export function generateFlowId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `f-${seg(3)}${seg(4)}`;  // e.g. "f-a3x9k2m7"
}

/** 流程 ID 合法性检查（返回错误列表，空=合法） */
export function validateFlowId(id: string, existingIds: string[], currentId: string): string[] {
  const errors: string[] = [];
  if (!id.trim()) errors.push('ID 不能为空');
  if (id !== id.trim()) errors.push('ID 首尾不能有空格');
  if (!/^[a-zA-Z0-9:-]+$/.test(id)) errors.push('仅允许字母、数字、:、-');
  if (id.length > 128) errors.push('ID 长度不能超过 128');
  // 重复检查：排除自身
  if (id !== currentId && existingIds.includes(id)) errors.push('该 ID 已被其他流程占用');
  return errors;
}
