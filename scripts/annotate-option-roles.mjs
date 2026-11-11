// 角色选项种子 role 标注脚本（一次性运行）
// 用法：node scripts/annotate-option-roles.mjs
// 1. 按内置映射表给 traits/feature 写 role（FeatureRole: active/passive/profile/stat）
// 2. 职业特性从文本「第X级」回填 level
// 3. 任何未命中映射的 (src,name) 报错退出，保证 100% 覆盖
import fs from 'fs';
import path from 'path';

const BASE = path.resolve(process.cwd(), 'public/seed/玩家手册2014/角色选项');

// ---- 默认规则（显式映射之外的结构化归类） ----
// 语言类一律 profile：语言非典型熟练项，不参与战斗场景（DM 裁定）
const PROFILE_NAMES = new Set(['年龄', '阵营', '体型', '速度', '亚种', '语言', '额外语言', '德鲁伊语', '盗贼黑话', '天语通']);
const STAT_NAME_RE = /属性值加成|属性值提升|熟练|战斗训练|武器训练|护甲训练|专长|刚毅|体魄$/;
const STAT_EXACT = new Set(['技能', '装备', '气豁免', '圆滑心智', '矮人刚毅', '龙族体魄', '原初斗士']);
const PASSIVE_EXACT = new Set(['黑暗视觉', '增强黑暗视觉', '伤害抗性', '炎狱抗性', '额外攻击']);
const defaultRole = (name) => {
  if (PROFILE_NAMES.has(name)) return 'profile';
  if (name.startsWith('创建')) return 'profile';
  if (STAT_NAME_RE.test(name) || STAT_EXACT.has(name)) return 'stat';
  if (PASSIVE_EXACT.has(name)) return 'passive';
  return null;
};

// ---- 显式映射：键 `${src}|${name}`，同名多条按数组顺序消费（如武僧两条「气」） ----
const M = {
  // ===== 种族 =====
  '龙裔|龙族血统': 'profile', '龙裔|吐息武器': 'active',
  '矮人|矮人体魄': 'passive', '矮人|石中精妙': 'passive',
  '精灵|妖精血统': 'passive', '精灵|出神': 'passive', '精灵|敏锐感官': 'stat',
  '丘陵矮人|矮人护甲训练': 'stat', '丘陵矮人|矮人刚毅': 'stat',
  '山地矮人|矮人护甲训练': 'stat', '山地矮人|矮人刚毅': 'stat',
  '木精灵|木精灵': 'profile', '木精灵|野性面具': 'passive', '木精灵|轻捷步伐': 'profile', '木精灵|精灵武器训练': 'stat',
  '高等精灵|戏法': 'stat', '高等精灵|精灵武器训练': 'stat',
  '卓尔|增强黑暗视觉': 'passive', '卓尔|日照敏感': 'passive', '卓尔|卓尔魔法': 'passive', '卓尔|卓尔武器训练': 'stat',
  '黑暗精灵|日照敏感': 'passive', '黑暗精灵|卓尔魔法': 'passive',
  '侏儒|侏儒狡黠': 'passive',
  '岩石侏儒|工匠学识': 'passive', '岩石侏儒|修补匠': 'passive',
  '岩石侏儒|发条玩具': 'passive', '岩石侏儒|打火机': 'passive', '岩石侏儒|音乐盒': 'passive',
  '森林侏儒|自然幻术师': 'stat', '森林侏儒|小型野兽交谈': 'passive',
  '半精灵|多才多艺': 'stat', '半精灵|技能': 'stat', '半精灵|专长': 'stat', '半精灵|妖精血统': 'passive',
  '半兽人|凶恶': 'stat', '半兽人|坚韧不屈': 'passive', '半兽人|凶蛮攻击': 'passive',
  '轻足半身人|幸运': 'passive', '轻足半身人|勇气': 'passive', '轻足半身人|半身人灵巧': 'passive',
  '半身人|幸运': 'passive', '半身人|勇气': 'passive', '半身人|半身人灵巧': 'passive',
  '轻足半身人|天生善匿': 'passive', '敦实半身人|天生善匿': 'passive',
  '敦实半身人|敦实体魄': 'passive',
  '人类|技能': 'stat', '人类|专长': 'stat',
  '提夫林|地狱遗赠': 'passive',
  // ===== 背景 feature（全部社交/探索向被动收益） =====
  '侍僧|信仰庇护': 'passive', '公会工匠|公会成员': 'passive', '化外之民|漂泊者': 'passive',
  '士兵|军衔': 'passive', '平民英雄|好客乡民': 'passive', '智者|研究员': 'passive',
  '水手|船家路子': 'passive', '流浪儿|城中秘密': 'passive', '罪犯|罪犯接头人': 'passive',
  '艺人|人见人爱': 'passive', '贵族|特权地位': 'passive', '隐士|研究发现': 'passive', '骗子|假身份': 'passive',
  // ===== 野蛮人 =====
  '野蛮人|原始直觉': 'profile', '野蛮人|危险的生活': 'profile', '野蛮人|狂暴': 'active',
  '野蛮人|无甲防御': 'stat', '野蛮人|鲁莽攻击': 'active', '野蛮人|险境感知': 'passive',
  '野蛮人|原初道途': 'profile', '野蛮人|快速移动': 'stat', '野蛮人|野性直觉': 'passive',
  '野蛮人|凶蛮重击': 'passive', '野蛮人|坚韧狂暴': 'passive', '野蛮人|持久狂暴': 'passive',
  '野蛮人|不屈勇武': 'passive',
  '图腾武者道途|精魄寻者': 'stat', '图腾武者道途|图腾精魄': 'passive', '图腾武者道途|兽之形': 'passive',
  '图腾武者道途|精魄行者': 'passive', '图腾武者道途|图腾同调': 'passive',
  '狂战士道途|狂怒': 'passive', '狂战士道途|无我狂暴': 'passive', '狂战士道途|威慑之姿': 'active', '狂战士道途|报偿': 'active',
  // ===== 吟游诗人 =====
  '吟游诗人|音乐与魔法': 'profile', '吟游诗人|从经验中学习': 'profile', '吟游诗人|诗人激励': 'active',
  '吟游诗人|万事通': 'passive', '吟游诗人|休憩曲': 'passive', '吟游诗人|吟游诗人学院': 'profile',
  '吟游诗人|专精': 'stat', '吟游诗人|激励之源': 'passive', '吟游诗人|反迷惑': 'active',
  '吟游诗人|魔法奥秘': 'stat', '吟游诗人|先发激励': 'passive',
  '勇气学院|附赠熟练项': 'stat', '勇气学院|战斗激励': 'passive', '勇气学院|战斗魔法': 'passive',
  '逸闻学院|语出惊人': 'active', '逸闻学院|额外魔法奥秘': 'stat', '逸闻学院|超凡技艺': 'active',
  // ===== 牧师 =====
  '牧师|医者和战士': 'profile', '牧师|神能代理': 'profile', '牧师|神圣领域': 'profile',
  '牧师|引导神力': 'active', '牧师|摧毁亡灵': 'passive', '牧师|神圣干预': 'active',
  '光明领域|附赠戏法': 'stat', '光明领域|守御闪光': 'active', '光明领域|引导神力：黎明曙光': 'active', '光明领域|精通闪光': 'passive', '光明领域|强力施法': 'passive',
  '战争领域|额外熟练项': 'stat', '战争领域|战争祭司': 'active', '战争领域|引导神力：导引打击': 'active', '战争领域|引导神力：战神祝福': 'active', '战争领域|神圣打击': 'passive', '战争领域|战斗化身': 'passive',
  '生命领域|生命门徒': 'passive', '生命领域|引导神力：维持生命': 'active', '生命领域|神佑医者': 'passive', '生命领域|极效治疗': 'passive',
  '生命领域|神圣打击': 'passive',
  '知识领域|知识祝福': 'stat', '知识领域|引导神力：岁月知识': 'active', '知识领域|引导神力：读心': 'active', '知识领域|透视过去': 'active',
  '知识领域|强力施法': 'passive',
  '自然领域|自然侍僧': 'stat', '自然领域|引导神力：魅惑动植物': 'active', '自然领域|抑制元素': 'active', '自然领域|自然之主': 'active',
  '诡术领域|诡术祝福': 'active', '诡术领域|引导神力：召唤分身': 'active', '诡术领域|引导神力：幽影斗篷': 'active', '诡术领域|精通分身': 'active',
  '诡术领域|神圣打击': 'passive',
  '风暴领域|风暴狂怒': 'active', '风暴领域|引导神力：毁灭狂怒': 'active', '风暴领域|雷霆打击': 'passive', '风暴领域|风暴降生': 'passive',
  '风暴领域|神圣打击': 'passive',
  '大地结社|附赠戏法': 'stat',
  // ===== 德鲁伊 =====
  '德鲁伊|自然之力': 'profile', '德鲁伊|维持平衡': 'profile',
  '德鲁伊|荒野变形': 'active', '德鲁伊|德鲁伊结社': 'profile', '德鲁伊|不朽身': 'passive', '德鲁伊|大德鲁伊': 'passive',
  '大地结社|自然恢复': 'active', '大地结社|结社法术': 'stat', '大地结社|大地行者': 'passive',
  '大地结社|自然之护': 'passive', '大地结社|自然庇护所': 'passive',
  '月亮结社|战斗荒野变形': 'passive', '月亮结社|结社形态': 'passive', '月亮结社|原初打击': 'passive',
  '月亮结社|元素荒野变形': 'passive', '月亮结社|千面相': 'passive',
  // ===== 战士 =====
  '战士|全能武斗家': 'profile', '战士|为冒险而生': 'profile', '战士|战斗风格': 'passive',
  '战士|回气': 'active', '战士|动作如潮': 'active', '战士|武术范型': 'profile', '战士|不屈': 'passive',
  '勇士|精通重击': 'passive', '勇士|运动健将': 'passive', '勇士|额外战斗风格': 'passive', '勇士|高效重击': 'passive', '勇士|生还者': 'passive',
  '奥法骑士|施法': 'passive', '奥法骑士|武器联结': 'active', '奥法骑士|战争魔法': 'passive', '奥法骑士|秘法打击': 'passive', '奥法骑士|秘法冲锋': 'passive', '奥法骑士|精通战争魔法': 'passive',
  '诡术师|施法': 'passive',
  '战斗大师|卓越战技': 'active', '战斗大师|战争学徒': 'stat', '战斗大师|知己知彼': 'active', '战斗大师|精通卓越战技': 'passive', '战斗大师|坚韧': 'passive',
  // ===== 武僧 =====
  '武僧|气之魔法': 'profile', '武僧|气': ['profile', 'active'], '武僧|修练和苦行': 'profile',
  '武僧|武艺': 'passive', '武僧|无甲移动': 'stat', '武僧|宗派': 'profile', '武僧|无甲防御': 'stat', '武僧|不朽身': 'passive',
  '武僧|拨挡飞弹': 'active', '武僧|轻身坠': 'active', '武僧|震慑拳': 'active', '武僧|真气注拳': 'passive',
  '武僧|反射闪避': 'passive', '武僧|心如止水': 'active', '武僧|百病不侵': 'passive',
  '武僧|金刚魂': 'passive', '武僧|空灵体': 'active', '武僧|超凡入圣': 'passive',
  '四象宗|四象门徒': 'active',
  '散打宗|散打技巧': 'active', '散打宗|混元体': 'active', '散打宗|宁神境': 'passive', '散打宗|渗透劲': 'active',
  '暗影宗|暗影技艺': 'active', '暗影宗|暗影步': 'active', '暗影宗|幽影斗篷': 'active', '暗影宗|灵机一斩': 'active',
  // ===== 圣武士 =====
  '圣武士|公义的事业': 'profile', '圣武士|超凡脱俗': 'profile', '圣武士|神圣感知': 'active',
  '圣武士|圣疗': 'active', '圣武士|至圣斩': 'active', '圣武士|神佑': 'passive',
  '圣武士|神圣誓言': 'profile', '圣武士|守护灵光': 'passive', '圣武士|勇气灵光': 'passive',
  '圣武士|战斗风格': 'passive', '圣武士|精通至圣斩': 'passive', '圣武士|净化之触': 'active',
  '古贤之誓|引导神力': 'profile', '古贤之誓|守御灵光': 'passive', '古贤之誓|不灭哨卫': 'passive', '古贤之誓|上古斗士': 'active',
  '复仇之誓|引导神力': 'profile', '复仇之誓|无情复仇': 'passive', '复仇之誓|复仇之魂': 'passive', '复仇之誓|复仇天使': 'active',
  '奉献之誓|引导神力': 'profile', '奉献之誓|奉献灵光': 'passive', '奉献之誓|纯净之魂': 'passive', '奉献之誓|至圣光轮': 'active',
  // ===== 游侠 =====
  '游侠|致命的猎人': 'profile', '游侠|孤独的冒险家': 'profile', '游侠|宿敌': 'passive',
  '游侠|自然探索者': 'passive', '游侠|游侠范型': 'profile', '游侠|原初意识': 'active',
  '游侠|大地行者': 'passive', '游侠|遁术': 'active', '游侠|无踪步': 'active',
  '游侠|野性感官': 'passive', '游侠|屠灭众敌': 'active', '游侠|战斗风格': 'passive',
  '猎人|猎物': 'profile', '猎人|防守战术': 'profile', '猎人|多重攻击': 'profile', '猎人|高效猎人防术': 'profile',
  '驯兽师|游侠伴侣': 'active', '驯兽师|特殊训练': 'passive', '驯兽师|兽性狂怒': 'passive', '驯兽师|法术共享': 'passive',
  // ===== 游荡者 =====
  '游荡者|技能和精准': 'profile', '游荡者|阴暗生活': 'profile', '游荡者|偷袭': 'passive',
  '游荡者|灵巧动作': 'active', '游荡者|游荡者范型': 'profile',
  '游荡者|直觉闪避': 'active', '游荡者|可靠才能': 'passive', '游荡者|听声辨位': 'passive',
  '游荡者|圆滑心智': 'stat', '游荡者|飘忽不定': 'passive', '游荡者|幸运一击': 'passive',
  '游荡者|专精': 'stat', '游荡者|反射闪避': 'passive',
  '刺客|暗杀': 'passive', '刺客|专业渗透': 'active', '刺客|冒充者': 'passive', '刺客|致命一击': 'passive',
  '盗贼|快手': 'active', '盗贼|梁上君子': 'passive', '盗贼|极效潜行': 'passive', '盗贼|使用魔法装置': 'passive', '盗贼|窃盗本能': 'passive',
  '诡术师|法师之手诈术': 'passive', '诡术师|诡术伏击': 'passive', '诡术师|万能诡术': 'active', '诡术师|法术窃贼': 'active',
  // ===== 术士 =====
  '术士|原生魔法': 'profile', '术士|未知力量': 'profile', '术士|术法起源': 'profile',
  '术士|魔力泉涌': 'active', '术士|超魔法': 'profile', '术士|术法复苏': 'passive',
  '狂野魔法|狂野魔法浪涌': 'passive', '狂野魔法|混乱之潮': 'passive', '狂野魔法|扭曲幸运': 'active',
  '狂野魔法|操控混沌': 'passive', '狂野魔法|法术轰击': 'passive',
  '龙族血脉|巨龙先祖': 'profile', '龙族血脉|龙族体魄': 'stat', '龙族血脉|元素亲和': 'passive', '龙族血脉|龙翼': 'active',
  // ===== 魔契师 =====
  '魔契师|宣誓与义务': 'profile', '魔契师|奥秘探寻者': 'profile', '魔契师|异界宗主': 'profile',
  '魔契师|契约魔法': 'passive', '魔契师|魔能祈唤': 'passive', '魔契师|魔契恩泽': 'profile',
  '魔契师|玄奥秘法': 'stat', '魔契师|魔能掌控': 'active',
  '魔契师|链之魔契': 'passive', '魔契师|书之魔契': 'passive',
  '旧日支配者|唤醒心灵': 'passive', '旧日支配者|熵光结界': 'passive', '旧日支配者|思维之盾': 'passive', '旧日支配者|创造奴仆': 'active',
  '至高妖精|妖精仪态': 'active', '至高妖精|雾遁': 'active', '至高妖精|斗转星移': 'passive', '至高妖精|幻影黑幕': 'active',
  '邪魔|黑暗赐福': 'passive', '邪魔|黑暗强运': 'passive', '邪魔|邪魔体魄': 'passive', '邪魔|直坠噩梦': 'active',
  // ===== 法师 =====
  '法师|奥术学者': 'profile', '法师|知识的诱惑': 'profile', '法师|奥术回想': 'active', '法师|奥术传承': 'profile',
  '变化学派|变化学者': 'passive', '变化学派|次级炼金': 'active', '变化学派|变化师之石': 'active', '变化学派|变形生物': 'stat', '变化学派|变化宗师': 'active',
  '咒法学派|咒法学者': 'passive', '咒法学派|次级咒术': 'active', '咒法学派|王车易位': 'active', '咒法学派|咒法专注': 'passive', '咒法学派|强韧召唤': 'passive',
  '塑能学派|塑能学者': 'passive', '塑能学派|法术塑形': 'passive', '塑能学派|强力戏法': 'passive', '塑能学派|强效塑能': 'passive', '塑能学派|超限导能': 'active',
  '幻术学派|幻术学者': 'passive', '幻术学派|精通次级幻象': 'stat', '幻术学派|易变幻象': 'active', '幻术学派|幻影化形': 'active', '幻术学派|亦真亦幻': 'passive',
  '惑控学派|惑控学者': 'passive', '惑控学派|催眠凝视': 'active', '惑控学派|直觉魅惑': 'active', '惑控学派|分裂惑控': 'passive', '惑控学派|编演记忆': 'passive',
  '死灵学派|死灵学者': 'passive', '死灵学派|惧怖收割': 'passive', '死灵学派|不死奴仆': 'stat', '死灵学派|不死适应': 'passive', '死灵学派|命令亡灵': 'active',
  '防护学派|防护学者': 'passive', '防护学派|奥术守御': 'passive', '防护学派|投射守御': 'active', '防护学派|精通防护': 'passive', '防护学派|法术抗性': 'passive',
  '预言学派|预言学者': 'passive', '预言学派|预兆': 'passive', '预言学派|预言专家': 'passive', '预言学派|天眼通': 'active', '预言学派|高等预兆': 'passive',
};

const LEVEL_RE = /第\s*(\d+)\s*级(?:时|起)/;
const parseLevel = (text) => {
  const m = (text || '').match(LEVEL_RE);
  return m ? parseInt(m[1], 10) : undefined;
};

// 同名数组消费游标：`${src}|${name}` → 已消费次数
const consumed = new Map();
const lookup = (src, name) => {
  const key = `${src}|${name}`;
  const v = M[key];
  if (Array.isArray(v)) {
    const i = consumed.get(key) ?? 0;
    if (i >= v.length) return null;
    consumed.set(key, i + 1);
    return v[i];
  }
  return v ?? null;
};

const stats = { annotated: 0, defaulted: 0, byRole: { active: 0, passive: 0, profile: 0, stat: 0 } };
const missing = [];
const levelSet = 0;

const annotateTrait = (t, src, isClassLike) => {
  if (!t?.name) return;
  let role = lookup(src, t.name);
  if (role == null) role = defaultRole(t.name);
  if (role == null) {
    missing.push(`${src}|${t.name}`);
    return;
  }
  t.role = role;
  stats.annotated++;
  stats.byRole[role]++;
  if (isClassLike && t.level == null) {
    const lv = parseLevel(t.text);
    if (lv) {
      t.level = lv;
    }
  }
};

for (const file of ['种族.json', '职业.json', '背景.json']) {
  const fp = path.join(BASE, file);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (const entry of data) {
    const isClassLike = file === '职业.json';
    for (const t of entry.traits || []) annotateTrait(t, entry.name, isClassLike);
    for (const sub of entry.subraces || []) {
      for (const t of sub.traits || []) annotateTrait(t, sub.name, false);
    }
    for (const sub of entry.subclasses || []) {
      for (const t of sub.features || []) annotateTrait(t, sub.name, true);
    }
    if (entry.feature?.name) {
      let role = lookup(entry.name, entry.feature.name);
      if (role == null) role = 'passive';
      entry.feature.role = role;
      stats.annotated++;
      stats.byRole[role]++;
    }
  }
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
  console.log(`${file}: 已写回`);
}

console.log('标注总数:', stats.annotated, '分布:', JSON.stringify(stats.byRole));
console.log('level 回填（职业类，从「第X级」解析）');
if (missing.length) {
  console.error('未覆盖条目（需补映射或默认规则）:\n' + missing.join('\n'));
  process.exit(1);
}
