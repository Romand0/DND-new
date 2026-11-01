// 出版物常量与分组：三宝书 5E 可整组打包勾选（展开为三本书名持久化）。
// 出版物条目存储团组无关（campaignId 恒空），团组仅持规则书集筛选配置。

import { equipmentStore } from '@/data/equipmentStore';
import { spellStore } from '@/data/spellStore';
import { optionStore } from '@/data/optionStore';
import npcTemplateStore from '@/data/npcTemplateStore';

export interface PublicationGroup {
  name: string;
  books: string[];
}

export const PUBLICATION_GROUPS: PublicationGroup[] = [
  { name: '三宝书 5E', books: ['玩家手册 2014', '城主指南 2014', '怪物图鉴 2014'] },
];

/** 系统已知出版物列表 = 四库条目 source 去重 ∪ 分组内书名（保证分组始终可勾选） */
export function listPublications(): string[] {
  const set = new Set<string>(PUBLICATION_GROUPS.flatMap((g) => g.books));
  for (const it of equipmentStore.getAllRaw()) if (it.source) set.add(it.source);
  for (const it of spellStore.getAllRaw()) if (it.source) set.add(it.source);
  for (const it of optionStore.getAllRaw()) if (it.source) set.add(it.source);
  for (const it of npcTemplateStore.getAllRaw()) if (it.source) set.add(it.source);
  return [...set];
}
