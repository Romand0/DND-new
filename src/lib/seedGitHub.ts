// 种子条目的 GitHub 编辑链接构建（管理员视角）。
// 种子文件驻留仓库 public/seed/，条目改动应直接提交到仓库。
// 仓库地址硬编码（与 origin 一致）；分支固定 main。

import type { SeedKind } from '@/data/seedLoader';
import { getSeedSourcePath } from '@/data/seedLoader';

const REPO_SLUG = 'Romand0/DND-new';
const BRANCH = 'main';

/** 返回种子条目源文件的 GitHub 编辑页 URL；非种子条目或无路径信息返回 null */
export function getSeedEditUrl(kind: SeedKind, id: string): string | null {
  const seedPath = getSeedSourcePath(kind, id);
  if (!seedPath) return null;
  // seedPath 形如 /seed/玩家手册2014/装备/武器.json → 仓库路径 public/seed/...
  const repoPath = 'public' + seedPath;
  return `https://github.com/${REPO_SLUG}/edit/${BRANCH}/${encodeSeedRepoPath(repoPath)}`;
}

/** 逐段编码仓库路径（保留 /，编码中文与特殊字符） */
function encodeSeedRepoPath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}
