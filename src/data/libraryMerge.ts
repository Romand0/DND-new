// 种子 ∪ 云端 合并层（纯函数，无副作用）。
// 合并规则（D&D 图鉴三库通用）：
//   1. 以种子为底（索引键 id）
//   2. cloud 行按 seedId ?? id 匹配种子：覆盖行替换字段，墓碑行（deleted）剔除种子
//   3. 自建条目（seedId 空且 id 不在种子集）直接并入
// 与团组/网络解耦，便于单测与复用。

export interface Mergeable {
  id: string;
  seedId?: string | null;
  deleted?: boolean;
  campaignId?: string | null;
}

export interface MergeResult<T> {
  items: T[];
  /** 纯种子 id 集合（无云端覆盖行）——UI 据此隐藏编辑删除入口 */
  seedIdSet: Set<string>;
  /** 被云端覆盖行命中的种子 id 集合——UI 据此恢复可编辑（编辑的是覆盖行） */
  cloudSeedIds: Set<string>;
}

/**
 * @param seeds 静态种子（基线，按 id 索引）
 * @param cloud 云端私有/覆盖/墓碑/自建行
 */
export function mergeBaseline<T extends Mergeable>(seeds: T[], cloud: T[]): MergeResult<T> {
  const seedIndex = new Map<string, T>();
  for (const s of seeds) seedIndex.set(s.id, s);

  // 云端行按「它指回的种子 id」分组：seedId 优先，自建行用自己的 id
  const overlayBySeed = new Map<string, T>();
  const tombstoned = new Set<string>();
  const extra: T[] = [];

  for (const row of cloud) {
    // 匹配键：覆盖行 seedId 指回种子；自建行无 seedId 用自身 id；旧出版物行无 seedId 用自身 id
    const target = row.seedId ?? row.id;
    const hitsSeed = seedIndex.has(target);
    if (row.deleted === true) {
      if (hitsSeed) tombstoned.add(target);
      // 自建条目的墓碑行：无种子可删，直接忽略
      continue;
    }
    if (hitsSeed) {
      // 覆盖行，或旧数据兼容（无 seedId 但 id 命中种子的出版物行回流）
      overlayBySeed.set(target, row);
    } else if (row.campaignId) {
      // 自建条目：团组私有（campaignId 非空）。真源自建行一定有归属团组。
      extra.push(row);
    }
    // 无 seedId + campaignId 空 + id 不命中种子 = 旧出版物残留行（种子已不收录，如已修复的
    // 脏数据）。丢弃，避免旧行回流覆盖新种子或产生幽灵条目。
  }

  const items: T[] = [];
  const seedIdSet = new Set<string>();
  const cloudSeedIds = new Set<string>();

  for (const s of seeds) {
    if (tombstoned.has(s.id)) continue;
    const overlay = overlayBySeed.get(s.id);
    if (overlay) {
      // 覆盖行的字段优先，但保留种子 id 与展示顺序（覆盖行 id 是 overlay id）
      items.push({ ...s, ...overlay, id: s.id });
      cloudSeedIds.add(s.id);
    } else {
      items.push(s);
      seedIdSet.add(s.id);
    }
  }

  // 自建条目并入（id 必不在种子集，走 extra 的行不会有种子冲突）
  for (const row of extra) {
    items.push(row);
  }

  return { items, seedIdSet, cloudSeedIds };
}

/** 纯种子（无覆盖行）不可编辑；有覆盖行的种子与自建条目可编辑 */
export function isSeedEditable(
  id: string,
  seedIdSet: Set<string>,
  cloudSeedIds: Set<string>
): boolean {
  if (!seedIdSet.has(id)) return true;
  return cloudSeedIds.has(id);
}
