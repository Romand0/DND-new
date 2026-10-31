// 职业熟练项块（护甲/武器/工具/技能任选）——玩家手册 2014 各职业「熟练项」小节手录。
// 提取脚本（scripts/extract-options.mjs）从未捕获该块：职业种子的 mechanics.proficiencies
// 全部为空串、features 只含带等级特性，导致「吟游诗人自选三项技能」等条目既不出现在
// 角色卡补全里，也不出现在熟练项解析里。选项数据走 localStorage/云端缓存，只改种子
// 到不了既有浏览器，故在代码层手录并作为唯一下游来源（补全 + 熟练项解析共用）。
// skillsCandidates 使用 SKILL_LABELS 标准名（原文的 求生→生存、医药→医疗、游说→说服
// 已归一），保证任选下拉与 SKILL_BY_ZH 反查可用；展示文本保留原书措辞。
// 工具任选候选引用 toolCategoryCandidates（乐器/工匠工具/赌具类别表，源自装备章工具表）。

import { TOOL_CATEGORY_CANDIDATES } from '@/data/toolCategoryCandidates';

export interface ClassProficiencyInfo {
  /** 护甲熟练项展示文本 */
  armor?: string;
  /** 武器熟练项展示文本 */
  weapons?: string;
  /** 工具熟练项展示文本（固定工具或任选的原文描述） */
  tools?: string;
  /** 工具任选数量（有值时熟练项解析生成 flexible tool 规则） */
  toolsChoiceCount?: number;
  /** 工具任选候选（缺省 = 自由文本输入，如乐器/工匠工具） */
  toolsCandidates?: string[];
  /** 技能任选数量（全部职业均为任选制） */
  skillsChoiceCount?: number;
  /** 技能任选候选（缺省 = 任意技能，如吟游诗人） */
  skillsCandidates?: string[];
  /** 技能熟练项展示文本（原书措辞） */
  skills?: string;
}

export const CLASS_PROFICIENCIES: Record<string, ClassProficiencyInfo> = {
  吟游诗人: {
    armor: '轻甲',
    weapons: '简易武器、手弩、长剑、刺剑、短剑',
    tools: '自选三种乐器',
    toolsChoiceCount: 3,
    toolsCandidates: TOOL_CATEGORY_CANDIDATES.乐器,
    skillsChoiceCount: 3,
    skills: '自选三项技能',
  },
  野蛮人: {
    armor: '轻甲、中甲、盾牌',
    weapons: '简易武器、军用武器',
    skillsChoiceCount: 2,
    skillsCandidates: ['驯兽', '运动', '威吓', '自然', '察觉', '生存'],
    skills: '从驯兽、运动、威吓、自然、察觉和生存中选两项',
  },
  圣武士: {
    armor: '所有护甲和盾牌',
    weapons: '简易武器和军用武器',
    skillsChoiceCount: 2,
    skillsCandidates: ['运动', '洞悉', '威吓', '医疗', '说服', '宗教'],
    skills: '在运动、洞悉、威吓、医药、游说、宗教中选择两项',
  },
  牧师: {
    armor: '轻甲、中甲、盾牌',
    weapons: '简易武器',
    skillsChoiceCount: 2,
    skillsCandidates: ['历史', '洞悉', '医疗', '说服', '宗教'],
    skills: '从历史、洞悉、医药、游说和宗教中选择两项',
  },
  德鲁伊: {
    armor: '轻甲、中甲、盾牌（德鲁伊不能装备或使用金属质的护甲和盾）',
    weapons: '短棒、匕首、飞镖、标枪、硬头锤、长棍、弯刀、镰刀、投石索、矛',
    tools: '草药工具',
    skillsChoiceCount: 2,
    skillsCandidates: ['奥秘', '驯兽', '洞悉', '医疗', '自然', '察觉', '宗教', '生存'],
    skills: '从奥秘、驯兽、洞悉、医药、自然、察觉、宗教和求生中选择两项',
  },
  战士: {
    armor: '全部护甲、盾牌',
    weapons: '简易武器、军用武器',
    skillsChoiceCount: 2,
    skillsCandidates: ['特技', '驯兽', '运动', '历史', '洞悉', '威吓', '察觉', '生存'],
    skills: '从特技、驯兽、运动、历史、洞悉、威吓、察觉和生存中选择两项',
  },
  武僧: {
    weapons: '简易武器、短剑',
    tools: '选择一种工匠工具或一种乐器',
    toolsChoiceCount: 1,
    // 工匠工具与乐器两类任选其一，候选为两类并集
    toolsCandidates: [...TOOL_CATEGORY_CANDIDATES.工匠工具, ...TOOL_CATEGORY_CANDIDATES.乐器],
    skillsChoiceCount: 2,
    skillsCandidates: ['特技', '运动', '历史', '洞悉', '宗教', '隐匿'],
    skills: '从特技、运动、历史、洞悉、宗教、隐匿中选择两项',
  },
  游侠: {
    armor: '轻甲、中甲、盾牌',
    weapons: '简易武器、军用武器',
    skillsChoiceCount: 3,
    skillsCandidates: ['驯兽', '运动', '洞悉', '调查', '自然', '察觉', '隐匿', '生存'],
    skills: '从驯兽、运动、洞悉、调查、自然、察觉、隐匿和生存中选择三项',
  },
  游荡者: {
    armor: '轻甲',
    weapons: '简易武器、手弩、长剑、刺剑、短剑',
    tools: '盗贼工具',
    skillsChoiceCount: 4,
    skillsCandidates: ['特技', '运动', '欺瞒', '洞悉', '威吓', '调查', '察觉', '表演', '说服', '巧手', '隐匿'],
    skills: '从特技、运动、欺瞒、洞悉、威吓、调查、察觉、表演、游说、巧手、隐匿中选择四项',
  },
  术士: {
    weapons: '匕首、飞镖、投石索、长棍、轻弩',
    skillsChoiceCount: 2,
    skillsCandidates: ['奥秘', '欺瞒', '洞悉', '威吓', '说服', '宗教'],
    skills: '从奥秘、欺瞒、洞悉、威吓、游说、宗教中选择两项',
  },
  魔契师: {
    armor: '轻甲',
    weapons: '简易武器',
    skillsChoiceCount: 2,
    skillsCandidates: ['奥秘', '欺瞒', '威吓', '调查', '历史', '自然', '宗教'],
    skills: '从奥秘、欺瞒、威吓、调查、历史、自然、宗教中选择两项',
  },
  法师: {
    weapons: '匕首、飞镖、投石索、长棍、轻弩',
    skillsChoiceCount: 2,
    skillsCandidates: ['奥秘', '历史', '洞悉', '调查', '医疗', '宗教'],
    skills: '在奥秘、历史、洞悉、调查、医药、宗教中选择两项',
  },
};

export function getClassProficiencyInfo(className: string): ClassProficiencyInfo | null {
  return CLASS_PROFICIENCIES[className] ?? null;
}
