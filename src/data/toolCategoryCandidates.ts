// 工具类别候选表——源自玩家手册第五章「工具表」（原文提取）。
// 「一种乐器」「一种工匠工具」「一种赌具」是类别型任选熟练项（背景工具熟练项与
// 武僧任选均采用），解析为 flexible 规则时需要具体候选列表；各工具类之间互不关联，
// 熟练项只对相应工具起效，故候选直接使用工具表的物品名（如「整副骰子」）。

/** 类别名 → 该类别全部候选（原书工具表物品名，顺序与原书一致） */
export const TOOL_CATEGORY_CANDIDATES: Record<string, string[]> = {
  乐器: ['风笛', '鼓', '扬琴', '长笛', '鲁特琴', '里拉琴', '角号', '排箫', '芦笛', '提琴'],
  工匠工具: [
    '炼金工具', '酿酒工具', '书法工具', '木匠工具', '制图工具', '鞋匠工具', '厨师工具',
    '玻璃匠工具', '珠宝匠工具', '皮匠工具', '石匠工具', '画家工具', '陶匠工具', '铁匠工具',
    '修补工具', '织布工具', '木雕工具',
  ],
  赌具: ['整副骰子', '整套龙棋', '整副纸牌', '整副三龙牌'],
};

/** 类别型任选措辞匹配：「一种乐器」「任选一种乐器」「一种工匠工具」等 */
const CATEGORY_TOOL_PATTERN = /^(?:一种|任选一种|任选)(乐器|工匠工具|赌具)$/;

/** 片段命中类别型任选时返回类别与候选；其余返回 null（走固定工具） */
export function matchToolCategory(name: string): { category: string; candidates: string[] } | null {
  const m = name.trim().match(CATEGORY_TOOL_PATTERN);
  if (!m) return null;
  const candidates = TOOL_CATEGORY_CANDIDATES[m[1]];
  return candidates ? { category: m[1], candidates } : null;
}
