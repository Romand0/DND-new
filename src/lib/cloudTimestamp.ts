// 云端 data JSON 内时间戳由服务端写入（functions/_utils.ts now() 为秒级），本地 store 写路径
// 统一 Date.now()（毫秒级）；历史拉取/导入可能让两套单位混存于本地桶。任何跨端比较前必须归一。
// 判界 1e11：当前毫秒约 1.7e12、秒级约 1.7e9，该阈值两侧都有千倍余量，可稳定区分单位。

/** 归一到秒：毫秒值除以 1000，秒级原样；无效值返回 0 */
export function toTimestampSeconds(t: unknown): number {
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return 0;
  return t > 1e11 ? Math.floor(t / 1000) : t;
}

/** 归一到毫秒：秒级值乘以 1000，毫秒原样；无效值返回 undefined（调用方保留原字段缺省） */
export function toTimestampMillis(t: unknown): number | undefined {
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return undefined;
  return t > 1e11 ? t : t * 1000;
}
