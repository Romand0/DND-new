#!/usr/bin/env node
/**
 * 怪物图鉴 2014 解析器（build-time，只读数据源）
 *
 * 用法：
 *   node scripts/parse-monsters.mjs            # 全量解析，产出种子 JSON + 报告
 *   node scripts/parse-monsters.mjs --check    # 重跑并与现有 JSON 比对字节一致性
 *
 * 产出：
 *   src/data/npcTemplates.json
 *   scripts/parse-monsters-report.md
 *
 * 零 npm 依赖：Node 内置 TextDecoder('gb18030') + 正则。
 * 数据源 data/DND5e_chm/怪物图鉴/ 只读，禁止写入。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data/DND5e_chm/怪物图鉴');
const OUT_JSON = path.join(ROOT, 'src/data/npcTemplates.json');
const OUT_REPORT = path.join(ROOT, 'scripts/parse-monsters-report.md');

const SOURCE_LABEL = '怪物图鉴 2014';
const INCLUDED_DIRS = [
  '不死生物', '元素生物', '天界生物', '巨人', '异怪', '怪兽', '构装生物', '植物',
  '泥怪', '类人生物', '精类', '邪魔', '野兽', '龙类', '非玩家角色',
];

// CR → 熟练加值标准表（MM2014 数据卡多数不印 PB，按 CR 推导并标 derived）
const CR_PB_TABLE = {
  '0': 2, '1/8': 2, '1/4': 2, '1/2': 2, '1': 2, '2': 2, '3': 2, '4': 2,
  '5': 3, '6': 3, '7': 3, '8': 3, '9': 4, '10': 4, '11': 4, '12': 4,
  '13': 5, '14': 5, '15': 5, '16': 5, '17': 6, '18': 6, '19': 6, '20': 6,
  '21': 7, '22': 7, '23': 7, '24': 7, '25': 8, '26': 8, '27': 8, '28': 8,
  '29': 9, '30': 9,
};

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_CN = { 力量: 'strength', 敏捷: 'dexterity', 体质: 'constitution', 智力: 'intelligence', 感知: 'wisdom', 魅力: 'charisma' };
const CN_NUM = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };

// ---- 报告收集 ----
const report = { files: [], fieldIssues: [], stats: { files: 0, cards: 0, ok: 0, failed: 0 } };

function fieldIssue(file, card, field, snippet) {
  report.fieldIssues.push({ file, card, field, snippet });
}

function decodeFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const dec = new TextDecoder('gb18030', { fatal: false });
  const text = dec.decode(buf);
  // 乱码信号：gb18030 是全编码空间，失败极罕见；用替换字符数量近似判断
  const bad = (text.match(/\uFFFD/g) || []).length;
  return { text, bad };
}

function stripHtml(raw) {
  return raw
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<\/(P|TR|LI|H[1-6]|DIV|BLOCKQUOTE|TABLE)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** 从文件行流中切出各数据卡的字段行区间（以「护甲等级」为锚） */
function splitCards(lines) {
  const anchors = [];
  lines.forEach((line, i) => {
    if (/^护甲等级[:：]/.test(line)) anchors.push(i);
  });
  const cards = [];
  for (let idx = 0; idx < anchors.length; idx++) {
    const start = anchors[idx];
    const end = idx + 1 < anchors.length ? anchors[idx + 1] : lines.length;
    // 回溯找名称行与体型/阵营行（最多向上 4 行）
    let nameLine = '';
    let typeLine = '';
    let nameIdx = start;
    for (let back = start - 1; back >= Math.max(0, start - 4); back--) {
      const l = lines[back];
      if (!typeLine && /^(微型|小型|中型|中形|大型|巨型|超巨型|超大型)/.test(l)) typeLine = l;
      if (typeLine && back > 0) {
        // 名称行 = 体型行的上一非空行；若它以中文段落感结尾（长度>60）视为缺名称
        const cand = lines[back - 1];
        if (cand && cand.length <= 80) {
          // 纯拉丁候选 → 中文半截被 Word 断行拆开，上并一行
          if (/^[A-Za-z0-9 ,'’\-]+$/.test(cand) && back - 2 >= 0 && /[\u4e00-\u9fa5]/.test(lines[back - 2])) {
            nameLine = lines[back - 2] + cand;
            nameIdx = back - 2;
          } else {
            nameLine = cand;
            nameIdx = back - 1;
          }
        }
        break;
      }
    }
    cards.push({ nameLine, typeLine, nameIdx, lines: lines.slice(start, end), anchorIdx: start });
  }
  return cards;
}

function joinNext(lines, i) {
  // 跨行拼合：括号未闭合（XP/骰式断行）或英文单词断行时并入下一行
  const cur = lines[i];
  const next = lines[i + 1];
  if (!next) return cur;
  const opens = (cur.match(/[（(]/g) || []).length;
  const closes = (cur.match(/[）)]/g) || []).length;
  if (opens > closes) return cur + next;
  if (/^XP）/.test(next)) return cur + next;
  if (/^生命值[:：]?\s*\d+$/.test(cur) && /^[（(]/.test(next)) return cur + next;
  if (/^(护甲等级|速度|挑战等级)[:：]$/.test(cur)) return cur + next;
  if (/(力量|敏捷|体质|智力|感知|魅力)$/.test(cur)) return cur + next;
  // 条目名的英文断行（如「吸取生命Life」+「Drain。半巫妖…」）：中文名+英文结尾，下一行以英文开头
  // 且 40 字内出现「（」或「。」（条目名结束信号）——不设长度上限，避免长正文断行时名称被并进上一条
  // 拼接处补空格：CHM 换行处原文是空格，直接连接会把 Devil'sSight 连成无空格串
  if (/[\u4e00-\u9fa5][A-Za-z'’\- ]*$/.test(cur) && /^[A-Za-z][A-Za-z'’\- ]{0,40}[（。]/.test(next)) return cur + ' ' + next;
  if (/[\u4e00-\u9fa5A-Za-z)]$/.test(cur) && /^[A-Za-z]/.test(next) && cur.length < 60 && next.length < 40) return cur + next;
  return cur;
}

function parseNameLine(raw, card, file) {
  // 名称行形如「兽人军官Orc War Chief」/「兽人军官Orc\nWar Chief」（英文换行拆断在切卡阶段已拼）
  const line = raw;
  const m = line.match(/^([\u4e00-\u9fa5（）()·、\-0-9]+?)([A-Za-z][A-Za-z'’\- ]*)$/);
  if (m) return { name: m[1].trim(), nameEn: m[2].trim() };
  const tailEn = (line.match(/([A-Za-z][A-Za-z'’\- ]{1,40})$/) || [])[1];
  if (tailEn && /[\u4e00-\u9fa5]/.test(line)) {
    const stripped = line.slice(0, line.length - tailEn.length).replace(/[A-Za-z][A-Za-z'’\- ]*/g, '').trim();
    return { name: stripped, nameEn: tailEn.trim() };
  }
  return { name: line.trim(), nameEn: '' };
}

function slugify(nameEn, name, dir) {
  const fromEn = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (fromEn) return fromEn;
  const latinRun = (name.match(/[A-Za-z][A-Za-z'’\-]*/) || [])[0];
  if (latinRun) return latinRun.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return name.replace(/\s+/g, '-');
}

// ===== 特质结构化解析（多重攻击 / 吐息武器 / 再生）：解析失败返回 undefined，原文保留在 traits =====

const ZH_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

// 多重攻击：「再发动三次攻击，一次啃咬和两次爪击」/「发动三次触须攻击」
// 按 [，。、；和及] 分段后逐段抽「(数词)次(武器名)」；总述段「三次攻击」无信息量，跳过
function parseMultiattack(traits) {
  const t = (traits ?? []).find((x) => /^多重攻击/.test(x.name ?? ''));
  if (!t) return undefined;
  const items = [];
  for (const seg of (t.text ?? '').split(/[，。、；和及]/)) {
    const m = seg.trim().match(/([一二两三四五六七八九十\d])次(?:发动|使用|进行|的)?([\u4e00-\u9fa5]{2,8})$/);
    if (!m) continue;
    const name = m[2];
    if (name === '攻击') continue;
    const n = ZH_NUM[m[1]] ?? parseInt(m[1], 10);
    if (n > 0) items.push({ count: n, name });
  }
  return items.length > 0 ? items : undefined;
}

// 吐息武器：抽充能/形状/DC/豁免属性/伤害/成功减半。
// 引言条目（「可以使用下列吐息武器之一：」）与过短文本跳过；纯效果型（斥力/迟缓/催眠）无伤害属合理
function parseBreathWeapon(traits) {
  const list = (traits ?? []).filter((x) => /吐息|喷吐/.test(x.name ?? ''));
  if (!list.length) return undefined;
  const out = [];
  for (const t of list) {
    const text = t.text ?? '';
    if (text.includes('下列吐息武器之一') || text.length < 40) continue;
    const recharge = text.match(/充能([\d~]+)/)?.[1];
    const shape = text.match(/覆盖(?:一处|)?[\d一-九十百]+尺[^，。]*?(锥状|线状|柱状|立方)/)?.[0];
    const dc = text.match(/DC\s*(\d{1,2})/);
    if (!dc) continue;
    // 「受45（10d8）点寒冷伤害」——CHM 原文常缺「到」字
    const dmg = text.match(/受(?:到)?(\d+)\s*（([^）]+)）点([\u4e00-\u9fa5]{2,4})伤害/);
    out.push({
      name: (t.name.match(/^[一-龥]+/) || [t.name])[0],
      recharge: recharge ? `充能${recharge}` : undefined,
      shape: shape || undefined,
      dc: parseInt(dc[1], 10),
      ability: text.match(/DC\s*\d{1,2}的?(力量|敏捷|体质|智力|感知|魅力)/)?.[1],
      damage: dmg?.[1],
      damageDice: dmg?.[2],
      damageType: dmg?.[3],
      halfOnSave: /减半/.test(text),
    });
  }
  return out.length > 0 ? out : undefined;
}

// 再生：「回合开始时恢复10点生命值」+ 可选失效条件（「若它受到火焰或强酸伤害」）
function parseRegeneration(traits) {
  const t = (traits ?? []).find((x) => /^再生/.test(x.name ?? ''));
  if (!t) return undefined;
  const amount = parseInt((t.text ?? '').match(/恢复(\d+)点生命值/)?.[1] ?? '', 10);
  if (!Number.isFinite(amount)) return undefined;
  return { amount, negate: t.text.match(/若它受到([\u4e00-\u9fa5]{2,12}伤害)/)?.[1] };
}

// 天生施法/施法：抽施法属性/DC/攻击命中 + 环阶分组法术列表。
// CHM 缺字（「智?」「魅?」）放宽映射；重复污染段的法术名跨段与段内双重去重；
// 原文未印 DC 或无环阶标记的单法术条目解析失败，保留 traits 原文
function parseSpellcasting(traits) {
  const t = (traits ?? []).find((x) => /^(天生施法|施法|契约施法|邪术施法)/.test(x.name ?? ''));
  if (!t) return undefined;
  const text = t.text ?? '';
  const dcs = [...text.matchAll(/DC(\d{1,2})/g)].map((m) => parseInt(m[1], 10));
  const abFull = text.match(/属性为(力量|敏捷|体质|智力|感知|魅力)/)?.[1];
  const ability = abFull ?? ({ 智: '智力', 魅: '魅力', 感: '感知', 力: '力量', 敏: '敏捷', 体: '体质' })[text.match(/属性为(智|魅|感|力|敏|体)\??/)?.[1] ?? ''];
  if (!dcs.length || !ability) return undefined;
  const attackBonus = parseInt(text.match(/命中\s*\+?\s*(\d{1,2})/)?.[1] ?? '', 10);
  // 环阶标记：「戏法（随意）：」「1环（3法术位）：」「随意：」（括号注记可选）
  const parts = text.split(/(戏法|\d环|随意)\s*(?:（[^）：]*)?）?：/);
  const groups = [];
  for (let i = 1; i < parts.length - 1; i += 2) {
    const ring = parts[i];
    const spells = [...new Set(parts[i + 1].split(/[，、；,]/)
      .map((s) => s.trim().match(/^[\u4e00-\u9fa5]{2,12}/)?.[0])
      .filter(Boolean))];
    if (!spells.length) continue;
    const g = groups.find((x) => x.ring === ring);
    if (g) g.spells = [...new Set(g.spells.concat(spells))];
    else groups.push({ ring, spells });
  }
  if (!groups.length) return undefined;
  return {
    ability,
    dc: dcs[0],
    attackBonus: Number.isFinite(attackBonus) ? attackBonus : undefined,
    groups,
  };
}

function parseTypeLine(line) {
  // 「中型类人（兽人），混乱邪恶」/「大型野兽，中立」/「巨型构造体，通常中立（绝对守序）」
  // 「超巨型」三字、「中形」形字——必须用多分支枚举，单字符类会失配
  const sizeMatch = line.match(/^(超巨型|超大型|微型|小型|中型|中形|大型|巨型)/);
  const size = sizeMatch ? sizeMatch[1] : '';
  const alignPart = line.includes('，') ? line.slice(line.lastIndexOf('，') + 1).trim() : '';
  const typePart = line.slice(size.length, line.lastIndexOf('，') > 0 ? line.lastIndexOf('，') : undefined).trim();
  return { size, type: typePart, alignment: alignPart };
}

function parseAc(line) {
  const body = line.replace(/^护甲等级[:：]?/, '').trim();
  const paren = body.match(/^(\d{1,2})\s*（([^）]*)）?/);
  if (paren) return { ac: parseInt(paren[1], 10), acNote: paren[2] || '' };
  // 双形态（「类人形态下10，熊与半人形态下11」）：取最大值，全文进 acNote
  const nums = body.match(/\d{1,2}/g);
  if (nums && nums.length) return { ac: Math.max(...nums.map((n) => parseInt(n, 10))), acNote: body };
  return null;
}

function parseHp(line) {
  const m = line.match(/^生命值[:：]?\s*(\d{1,3})\s*（([0-9dD+\-\s]+?)）\s*[,，。;；]?\s*$/);
  if (m) return { maxHp: parseInt(m[1], 10), hpDice: m[2].replace(/\s+/g, '').toLowerCase() };
  const m2 = line.match(/^生命值[:：]?\s*(\d{1,3})\s*[,，。;；]?\s*$/);
  if (m2) return { maxHp: parseInt(m2[1], 10), hpDice: '' };
  return null;
}

function parseSpeed(line) {
  const m = line.match(/^速度[:：]?\s*(\d{1,3})\s*尺?\s*(.*)$/);
  if (!m) return null;
  return { speed: parseInt(m[1], 10), speedNotes: (m[2] || '').trim() };
}

function parseAbilities(lines, card, file) {
  // 六维分布在 1~2 行：力量..体质 / 智力..魅力
  const vals = {};
  const found = [];
  const re = /(力量|敏捷|体质|智力|感知|魅力?)\s*（?（?\s*(\d{1,2})/g;
  for (const l of lines.slice(0, 12)) {
    if (/^(技能|豁免|感官|语言)[:：]?/.test(l)) break;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(l))) {
      const label = m[1] === '魅' ? '魅力' : m[1];
      if (ABILITY_CN[label] && vals[ABILITY_CN[label]] === undefined) {
        vals[ABILITY_CN[label]] = parseInt(m[2], 10);
        found.push(label);
      }
    }
  }
  // 位置序兜底：标签残缺时按出现顺序填
  if (found.length < 6) {
    const seq = lines.find((l) => /力量/.test(l) || /敏捷/.test(l));
    const nums = (seq || '').match(/\d{1,2}/g) || [];
    ABILITY_KEYS.forEach((k, i) => {
      if (vals[k] === undefined && nums[i] !== undefined) {
        vals[k] = parseInt(nums[i], 10);
        fieldIssue(file, '', 'ability-fallback', `${k}=${nums[i]}（标签残缺，位置序推导）`);
      }
    });
  }
  ABILITY_KEYS.forEach((k) => {
    if (vals[k] === undefined) {
      vals[k] = 10;
      fieldIssue(file, '', `ability.${k}`, '缺失，按 10 兜底');
    }
  });
  return vals;
}

function parseSaves(line) {
  if (!/^豁免[:：]/.test(line)) return [];
  const out = [];
  const re = /(力量|敏捷|体质|智力|感知|魅力)\s*[+\-]\d+/g;
  let m;
  while ((m = re.exec(line))) out.push(ABILITY_CN[m[1]]);
  return out;
}

function parseSkills(line) {
  if (!/^技能[:：]/.test(line)) return [];
  const body = line.replace(/^技能[:：]\s*/, '');
  const out = [];
  const re = /([\u4e00-\u9fa5]{2,6})\s*([+\-]\d{1,2})/g;
  let m;
  while ((m = re.exec(body))) out.push({ name: m[1], bonus: parseInt(m[2], 10) });
  return out;
}

function parseCr(line) {
  // 「挑战等级：4（1,100 XP） 熟练加值+4」/ XP 可能被换行拆断（已拼行）
  const m = line.match(/^挑战等级[:：]?\s*([0-9/]+|—|无)\s*（?\s*([\d,]*)\s*[Xx][Pp]?）?/) ||
    line.match(/^挑战等级[:：]?\s*([0-9/]+|—|无)/) ||
    line.match(/^挑战等级[:：]?\s*\S*?为\s*([0-9/]+)\s*（?\s*([\d,]*)\s*[Xx][Pp]/);
  if (!m) return null;
  const cr = m[1];
  const xp = m[2] ? parseInt(m[2].replace(/,/g, ''), 10) : undefined;
  const pbm = line.match(/熟练加值\s*[+\-]?\s*(\d+)/);
  let pb = pbm ? parseInt(pbm[1], 10) : undefined;
  let pbDerived = false;
  if (pb === undefined) {
    pb = CR_PB_TABLE[cr];
    pbDerived = pb !== undefined;
    if (pb === undefined) { pb = 2; pbDerived = true; fieldIssue('', '', 'pb', `CR=${cr} 无标准表条目，按 +2 兜底`); }
  }
  return { cr, xp, proficiencyBonus: pb, pbDerived };
}

function splitList(body) {
  return body.split(/[、，,;；/]/).map((s) => s.trim()).filter(Boolean);
}

function parseResistGroups(cardLines, file, cardName) {
  const out = { damageResistances: [], damageImmunities: [], damageVulnerabilities: [], conditionImmunities: [] };
  for (const line of cardLines) {
    let m;
    if ((m = line.match(/^(?:伤害)?抗性[:：]\s*(.+)$/))) out.damageResistances = splitList(m[1]);
    else if ((m = line.match(/^(?:伤害)?免疫[:：]\s*(.+)$/))) out.damageImmunities = splitList(m[1]);
    else if ((m = line.match(/^伤害易伤[:：]\s*(.+)$/))) out.damageVulnerabilities = splitList(m[1]);
    else if ((m = line.match(/^状态免疫[:：]\s*(.+)$/))) out.conditionImmunities = splitList(m[1]);
    else if ((m = line.match(/^(?:伤害)?易伤[:：]\s*(.+)$/))) out.damageVulnerabilities = splitList(m[1]);
  }
  return out;
}

function parseSensesLanguages(cardLines) {
  let senses = '';
  let languages = '';
  for (const line of cardLines) {
    let m;
    if ((m = line.match(/^感官[:：]?\s*(.+)$/))) senses = m[1].trim();
    else if ((m = line.match(/^语言[:：]?\s*(.+)$/))) languages = m[1].trim();
  }
  return { senses, languages };
}

/** 动作区条目 → NpcAttack（武器攻击行）或 traits（非攻击条目）。
 * 状态机：「名称（参数）。正文」开启条目，其后的非攻击/非标题行并入条目正文（跨行描述）；
 * 章节标题（动作/传奇动作/区域效应…）重置条目链，标题后的导语行与效应列表行不污染上一条目。
 * 注意：joined 只是逐行拼接预览（长度与 card.lines 一致），卡名/体型判定须读原始行。
 */
function parseActionsAndTraits(cardLines, file, cardName) {
  const attacks = [];
  const traits = [];
  const isTypeLine = (l) => /^(微型|小型|中型|中形|大型|巨型|超巨型|超大型)/.test(l || '');
  // 真正的下一卡名称行 = 「中文+英文」无句号且 1~2 行内出现体型行（卡名英文也可能被 Word 断成两行，
  // 如「远古黑龙Ancient Black」+「Dragon」+体型行）；条目名的英文断行中间态（「吸取生命Life」+「Drain。…」）
  // 后续是英文正文行，据此区分
  const isNextCardName = (l, i) => {
    if (!/^[\u4e00-\u9fa5（）()·、\-0-9]+[A-Za-z][A-Za-z'’\- ]*$/.test(l)) return false;
    if (isTypeLine(cardLines[i + 1])) return true;
    return /^[A-Za-z][A-Za-z'’\- ]*$/.test(cardLines[i + 1] || '') && isTypeLine(cardLines[i + 2]);
  };
  let current = null;
  let currentAtk = null; // 拆行排版（单元格逐行）时后续行并入攻击对象做二次解析
  let pendingName = ''; // 纯名称行（CHM 断行排版：名称拼合后独占一行，正文另起一行）
  for (let i = 0; i < cardLines.length; i++) {
    const line = cardLines[i];
    if (/^(动作|附赠动作|反应|传奇动作)(Actions|Bonus Actions|Reactions|Legendary Actions)?$/.test(line)
      || /^(特质|特性)(Traits?)?$/.test(line)) { current = null; currentAtk = null; pendingName = ''; continue; }
    if (/^(区域效应|Regional Effects|巢穴动作|Lair Actions)/.test(line)) { current = null; currentAtk = null; pendingName = ''; continue; }
    const atk = parseAttackLine(line);
    if (atk) {
      if (!atk.name && currentAtk && (currentAtk._raw || '').includes(line)) {
        // 空名攻击且该行原文已在上条 raw 中 = 重复行产物，并入上一条继续解析
        currentAtk._raw = (currentAtk._raw || '') + line;
        enrichAttack(currentAtk, currentAtk._raw);
      } else if (!atk.name && pendingName) {
        // 空名攻击 + 前有纯名称行（「轻弩Light Crossbow。」+ 独立正文行）：补名称独立成条
        atk.name = pendingName;
        pendingName = '';
        attacks.push(atk);
        currentAtk = atk;
        currentAtk._raw = line;
        current = null;
      } else {
        attacks.push(atk);
        currentAtk = atk;
        currentAtk._raw = line; // 首行即攻击头，后续行并入后可完整重算 note/伤害
        current = null;
      }
      continue;
    }
    if (isNextCardName(line, i)) break;
    // 纯名称行：「轻弩Light Crossbow。」——名称拼合后独占一行、无正文；记名等待下一空名攻击行消费
    const nm = line.match(/^([\u4e00-\u9fa5]{1,12})([A-Za-z'’\- ]+)。$/);
    if (nm) { pendingName = nm[1]; continue; }
    const tm = line.match(/^([\u4e00-\u9fa5]{1,20}[A-Za-z'’\- ]*)(?:（([^）]{1,30})）)?。\s*(.+)$/);
    if (tm && tm[3].length > 2) {
      current = { name: (tm[1] || '').trim(), text: `${tm[2] ? `（${tm[2]}）` : ''}${tm[3].trim()}`.trim() };
      currentAtk = null;
      traits.push(current);
      continue;
    }
    // 延续行：特性描述的跨行后续（正文断行/列表），并入当前条目
    if (current && line.length > 1) { current.text += line; continue; }
    // 拆行攻击的后续行（命中/加值/触及/伤害段各自成行）：拼入原始串重跑伤害解析
    if (currentAtk && line.length > 1 && !/^[A-Za-z][A-Za-z'’\- ]*$/.test(line)) {
      // 护栏：长叙述行（下卡正文/风味文本）与重复行（joinNext 重复拼接产物）不并入
      if (line.length > 60 || (currentAtk._raw || '').includes(line)) { currentAtk = null; continue; }
      currentAtk._raw = (currentAtk._raw || '') + line;
      enrichAttack(currentAtk, currentAtk._raw);
    }
  }
  return { attacks, traits };
}

function parseAttackLine(line) {
  // 「巨斧Greataxe。近战武器攻击：命中+6，触及5尺，单一目标。命中：15（1d12+4外加1d8）点挥砍伤害。」
  // 「武器攻击：」须在行首或句号后——多重攻击条目正文（「…发动三次武器攻击：一次尾击…」）不是攻击
  if (!/(?:^|。)\s*(?:近战|远程|法术)?(?:或)?(?:近战|远程|法术)?武器攻击[:：]/.test(line)) return null;
  const nameM = line.match(/^([\u4e00-\u9fa5]{1,12})([A-Za-z'’\- ]*)(?:（[^）]*）)?。\s*/);
  const name = nameM ? nameM[1] : '';
  const nameEn = nameM && nameM[2] ? nameM[2].trim() : '';
  const bonusM = line.match(/命中\s*([+\-]\d{1,2})/);
  const reachM = line.match(/触及\s*(\d{1,3})\s*尺/);
  const rangeM = line.match(/射程\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*尺/);
  // 「点」可选：龙类等写作「命中：17（2d10+6）穿刺伤害」（无「点」）；
  // 「近战时/远程时」前缀（标枪双模式：「命中：近战时9（2d6+2）…，或远程时5（1d6+2）…」）；
  // 前缀「命中」或「伤害」（铁魔像：「命中+13，触及5尺，单一目标。伤害20（3d8+7）点钝击伤害」）；
  // 骰子字符类含 ?−－＋：gb18030 解码失败时减号会变成 ?/−，全角加号出现在部分条目；
  // 「的」可选：毒虫罗斯魔 CHM 版缺字「9（2d4+4）的挥砍伤。」
  const dmgM = line.match(/(?:命中|伤害)[:：]?\s*(?:近战时|远程时)?\s*\d{1,3}\s*（([0-9dD+\-?−－＋\s外加]+?)）\s*(?:点|的)?\s*(\S{2,4}?)伤(?:害)?/);
  // 无括号固定伤害（CR0 野兽/飞蛇/铁魔像）：「命中：1点穿刺伤害」「伤害：1点穿刺伤害」「伤害20（3d8+7）点钝击伤害」
  const plainDmgM = !dmgM
    ? line.match(/(?:命中|伤害)[:：]?\s*(\d{1,3})\s*点?([\u4e00-\u9fa5]{2,4}?)伤害/)
    : null;
  const saveHitM = line.match(/命中[:：]\s*([^。]{2,80})。/);
  const afterDmgM = line.match(/点?[\u4e00-\u9fa5]{2,4}伤害[，。]?\s*(.*)$/);
  const isRanged = /远程/.test(line);
  let normalRange = reachM ? parseInt(reachM[1], 10) : undefined;
  let maxRange = normalRange;
  if (rangeM) { normalRange = parseInt(rangeM[1], 10); maxRange = parseInt(rangeM[2], 10); }
  if (normalRange === undefined) { normalRange = 5; maxRange = 5; }
  // 解码失败的减号归一化（1d4?1 / 1d4−1 / 1d4－1 / 1d4＋1 → 1d4-1 / 1d4+1）
  const parenDice = dmgM ? dmgM[1].replace(/[?−－]/g, '-').replace(/[＋]/g, '+').replace(/\s+/g, '').toLowerCase() : '';
  const diceOnly = (parenDice.match(/\d+d\d+(?:[+\-]\d+)?/) || [])[0] || parenDice;
  const extraDice = parenDice.slice(diceOnly.length).trim();
  const twoHandM = line.match(/双手[^。]*?攻击时\s*\d{1,3}\s*（([0-9dD+\-]+)）/);
  const twoHandedDamage = twoHandM ? twoHandM[1].toLowerCase() : undefined;
  const damageType = dmgM ? dmgM[2] : (plainDmgM ? plainDmgM[2] : '');
  // 无括号格式伤害为固定点数（原书省略骰式）
  const damage = diceOnly || (plainDmgM ? plainDmgM[1] : '');
  if (!damage && dmgM) fieldIssue('', name, 'attack.damage', line.slice(0, 60));
  const props = [];
  if (/双手/.test(line)) props.push('多用');
  if (/装填/.test(line)) props.push('装填');
  if (/精细/.test(line)) props.push('精细');
  if (/轻/.test(line)) props.push('轻');
  const afterText = afterDmgM && afterDmgM[1] ? afterDmgM[1].trim() : '';
  // [^。]：note 只取到下一句号——跨行拼合可能带入下卡叙事文本（如飞蛇卡尾部的风味段）
  const afterDmgNote = afterText.split(/。/)[0].replace(/^[，,、]/, '').trim();
  const note = [extraDice, afterDmgNote].filter(Boolean).join('；').slice(0, 200) ||
    (!damage && saveHitM ? saveHitM[1].trim().slice(0, 200) : '');
  return {
    name,
    attackBonus: bonusM ? bonusM[1] : '',
    damage, damageType, twoHandedDamage,
    range: rangeM ? `射程${normalRange}/${maxRange}尺` : `触及${normalRange}尺`,
    properties: props,
    normalRange, maxRange,
    note,
  };
}

/** 拆行攻击的二次解析：后续单元格行拼入 _raw 后补齐伤害/加值/附注 */
function enrichAttack(atk, raw) {
  const dmgM = raw.match(/(?:命中|伤害)[:：]?\s*(?:近战时|远程时)?\s*\d{1,3}\s*（([0-9dD+\-?−－＋\s外加]+?)）\s*(?:点|的)?\s*(\S{2,4}?)伤(?:害)?/)
    || raw.match(/伤害[:：]?\s*\d{1,3}\s*（([0-9dD+\-?−－＋\s]+?)）\s*(?:点|的)?\s*([\u4e00-\u9fa5]{2,4}?)伤(?:害)?/);
  const plainDmgM = !dmgM
    ? raw.match(/(?:命中|伤害)[:：]?\s*(\d{1,3})\s*点?([\u4e00-\u9fa5]{2,4}?)伤害/)
    : null;
  if (dmgM) {
    const parenDice = dmgM[1].replace(/[?−－]/g, '-').replace(/[＋]/g, '+').replace(/\s+/g, '').toLowerCase();
    const diceOnly = (parenDice.match(/\d+d\d+(?:[+\-]\d+)?/) || [])[0] || parenDice;
    if (diceOnly && !atk.damage) atk.damage = diceOnly;
    const extraDice = parenDice.slice(diceOnly.length).trim();
    if (extraDice && !atk.note) atk.note = extraDice;
    if (dmgM[2] && !atk.damageType) atk.damageType = dmgM[2];
  } else if (plainDmgM) {
    if (!atk.damage) atk.damage = plainDmgM[1];
    if (plainDmgM[2] && !atk.damageType) atk.damageType = plainDmgM[2];
  }
  if (!atk.attackBonus) {
    const bonusM = raw.match(/命中\s*([+\-]\d{1,2})/);
    if (bonusM) atk.attackBonus = bonusM[1];
  }
  if (atk.normalRange === 5 && atk.maxRange === 5) {
    const reachM = raw.match(/触及\s*(\d{1,3})\s*尺/);
    const rangeM = raw.match(/射程\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*尺/);
    if (rangeM) {
      atk.normalRange = parseInt(rangeM[1], 10);
      atk.maxRange = parseInt(rangeM[2], 10);
      atk.range = `射程${atk.normalRange}/${atk.maxRange}尺`;
    } else if (reachM) {
      atk.normalRange = parseInt(reachM[1], 10);
      atk.maxRange = atk.normalRange;
      atk.range = `触及${atk.normalRange}尺`;
    }
  }
  // note 重算：有主伤害时取伤害后的补充段（豁免/外加描述）；豁免型取最长命中段（raw 可能被
  // joinNext 重复行污染，首个匹配会截断在重复行句号处）
  const afterTextM = raw.match(/点?[\u4e00-\u9fa5]{2,4}伤害[，。]?\s*([^。]*)/);
  const saveHits = [...raw.matchAll(/命中[:：]\s*([^。]{2,200})。/g)].map((m) => m[1]);
  const recalcNote = atk.damage
    ? (afterTextM && afterTextM[1] ? afterTextM[1].replace(/^[，,、。]/, '').trim() : '')
    : (saveHits.length ? saveHits.reduce((a, b) => (b.length > a.length ? b : a)).trim() : '');
  if (recalcNote) atk.note = recalcNote.slice(0, 200);
  else if (!atk.note) {
    const saveHitM = saveHits[0];
    if (saveHitM) atk.note = saveHitM.trim().slice(0, 200);
  }
}

/** 目录名 → CreatureType 枚举值 */
function dirToCreatureType(dir) {
  // CreatureType 为字符串枚举（src/types/combat.ts CREATURE_TYPE_LABELS）
  const map = {
    不死生物: 'undead', 野兽: 'beast', 构装生物: 'construct', 泥怪: 'ooze',
    天界生物: 'celestial', 元素生物: 'elemental', 精类: 'fey', 邪魔: 'fiend',
    巨人: 'giant', 类人生物: 'humanoid', 怪兽: 'monstrosity', 异怪: 'aberration',
    植物: 'plant', 龙类: 'dragon', 非玩家角色: 'humanoid',
  };
  return map[dir];
}

function sizeToEnum(sizeCn) {
  // 「中形」= Medium 旧译、「超大型」= Gargantuan 旧译，均归一到标准枚举
  const map = { 微型: 0, 小型: 1, 中型: 2, 中形: 2, 大型: 3, 巨型: 4, 超巨型: 5, 超大型: 5 };
  return map[sizeCn];
}

function parseFile(filePath, dir) {
  const rel = path.relative(SOURCE_DIR, filePath);
  const { text, bad } = decodeFile(filePath);
  if (bad > 40) fieldIssue(rel, '', 'decode', `替换字符 ${bad} 个，疑似编码异常`);
  const lines = stripHtml(text);
  const cards = splitCards(lines);
  const out = [];
  report.stats.cards += cards.length;
  for (const card of cards) {
    const nameInfo = parseNameLine(card.nameLine, card, rel);
    if (!nameInfo.name) {
      report.stats.failed++;
      fieldIssue(rel, `#${cards.indexOf(card) + 1}`, 'name', `名称行缺失：${card.lines[0]?.slice(0, 40) || ''}`);
      continue;
    }
    // 拼合必须消费式：joinNext 命中时 next 行已被并入，不能再留在 joined 里，
    // 否则残留的后半行会被延续行分支重复并入特性文本（劣魔「魔鬼视界」描述重复 bug）
    const joined = [];
    for (let li = 0; li < card.lines.length; ) {
      const merged = joinNext(card.lines, li);
      if (merged !== card.lines[li]) { joined.push(merged); li += 2; }
      else { joined.push(card.lines[li]); li += 1; }
    }
    const typeInfo = parseTypeLine(card.typeLine || '');
    const acHead = /[:：]$/.test(card.lines[0]) ? card.lines[0] + (card.lines[1] || '') : card.lines[0];
    const ac = parseAc(acHead);
    if (!ac) { report.stats.failed++; fieldIssue(rel, nameInfo.name, 'ac', card.lines[0]?.slice(0, 50)); continue; }
    const hp = parseHp(joined.find((l) => /^生命值/.test(l)) || '');
    if (!hp) { report.stats.failed++; fieldIssue(rel, nameInfo.name, 'hp', '未解析'); continue; }
    const speed = parseSpeed(joined.find((l) => /^速度/.test(l)) || '');
    if (!speed) { report.stats.failed++; fieldIssue(rel, nameInfo.name, 'speed', '未解析'); continue; }
    const abilities = parseAbilities(joined, card, rel);
    const saves = parseSaves(joined.find((l) => /^豁免/.test(l)) || '');
    const skills = parseSkills(joined.find((l) => /^技能/.test(l)) || '');
    const crInfo = parseCr(joined.find((l) => /^挑战等级/.test(l)) || '');
    if (!crInfo) { report.stats.failed++; fieldIssue(rel, nameInfo.name, 'cr', '未解析'); continue; }
    if (crInfo.pbDerived) fieldIssue(rel, nameInfo.name, 'pb', `CR=${crInfo.cr} 推导 PB=${crInfo.proficiencyBonus}`);
    const resist = parseResistGroups(joined, rel, nameInfo.name);
    const sl = parseSensesLanguages(joined);
    const { attacks, traits } = parseActionsAndTraits(joined, rel, nameInfo.name);
    if (process.env.DBG_MONSTER && nameInfo.name.includes(process.env.DBG_MONSTER)) {
      console.error(`===== ${rel} =====`);
      console.error('JOINED 动作区行流:', joined.slice(card.anchorIdx, card.anchorIdx + 60));
      console.error('attacks:', JSON.stringify(attacks, null, 1));
    }
    const descriptionLines = [];
    for (let i = card.nameIdx + 1; i < card.anchorIdx && i < card.nameIdx + 4; i++) {
      const l = lines[i];
      if (l && !/^[微小中大超巨]型/.test(l)) descriptionLines.push(l);
    }
    out.push({
      templateId: slugify(nameInfo.nameEn, nameInfo.name, dir),
      name: nameInfo.name,
      nameEn: nameInfo.nameEn,
      cr: crInfo.cr,
      xp: crInfo.xp,
      proficiencyBonus: crInfo.proficiencyBonus,
      pbDerived: crInfo.pbDerived || undefined,
      size: typeInfo.size,
      type: typeInfo.type || dir,
      alignment: typeInfo.alignment,
      ac: ac.ac,
      acNote: ac.acNote,
      ...hp,
      speed: speed.speed,
      speedNotes: speed.speedNotes,
      ...abilities,
      savingThrows: saves,
      skills,
      senses: sl.senses,
      languages: sl.languages,
      ...resist,
      traits,
      multiattack: parseMultiattack(traits),
      breathWeapon: parseBreathWeapon(traits),
      regeneration: parseRegeneration(traits),
      spellcasting: parseSpellcasting(traits),
      attacks: attacks.map((a) => ({
        name: a.name, attackBonus: a.attackBonus, damage: a.damage, damageType: a.damageType,
        range: a.range, properties: a.properties, normalRange: a.normalRange, maxRange: a.maxRange,
        twoHandedDamage: a.twoHandedDamage, note: a.note || undefined,
      })),
      description: descriptionLines.join(' ').slice(0, 300) || undefined,
      source: SOURCE_LABEL,
      sourceDir: dir,
      creatureSize: sizeToEnum(typeInfo.size),
      creatureType: dirToCreatureType(dir),
    });
    report.stats.ok++;
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`数据源不存在: ${SOURCE_DIR}`);
    process.exit(1);
  }
  const all = [];
  for (const dir of INCLUDED_DIRS) {
    const dirPath = path.join(SOURCE_DIR, dir);
    if (!fs.existsSync(dirPath)) { fieldIssue(dir, '', 'dir', '目录不存在'); continue; }
    const entries = fs.readdirSync(dirPath).filter((f) => /\.(htm|html)$/i.test(f)).sort();
    for (const f of entries) {
      report.stats.files++;
      try {
        const parsed = parseFile(path.join(dirPath, f), dir);
        all.push(...parsed);
      } catch (e) {
        report.stats.failed++;
        fieldIssue(path.join(dir, f), '', 'exception', e.message);
      }
    }
  }

  // templateId 去重：撞名加目录前缀
  const seen = new Map();
  for (const t of all) {
    if (seen.has(t.templateId)) {
      const prev = seen.get(t.templateId);
      if (prev.sourceDir !== t.sourceDir) {
        prev.templateId = `${prev.sourceDir}-${prev.templateId}`;
        t.templateId = `${t.sourceDir}-${t.templateId}`;
      } else {
        t.templateId = `${t.templateId}-${seen.size}`;
      }
    }
    seen.set(t.templateId, t);
  }
  all.sort((a, b) => a.templateId.localeCompare(b.templateId));

  const json = JSON.stringify(all, null, 2) + '\n';
  if (check) {
    const existing = fs.existsSync(OUT_JSON) ? fs.readFileSync(OUT_JSON, 'utf8') : '';
    if (existing === json) { console.log('CHECK OK: 输出与现有 JSON 字节一致'); process.exit(0); }
    console.error('CHECK FAILED: 输出与现有 JSON 不一致');
    process.exit(1);
  }

  fs.writeFileSync(OUT_JSON, json, 'utf8');
  const issues = report.fieldIssues.map((i) => `| ${i.file} | ${i.card} | ${i.field} | ${i.snippet.replace(/\|/g, '/').slice(0, 80)} |`).join('\n');
  const md = `# 怪物图鉴解析报告\n\n- 文件数：${report.stats.files}\n- 数据卡数：${report.stats.cards}\n- 成功：${report.stats.ok}\n- 失败：${report.stats.failed}\n- 产出模板：${all.length}\n- 字段级提示：${report.fieldIssues.length}\n\n| 文件 | 数据卡 | 字段 | 片段 |\n|------|--------|------|------|\n${issues}\n`;
  fs.writeFileSync(OUT_REPORT, md, 'utf8');
  console.log(`解析完成：${all.length} 模板 / ${report.stats.cards} 卡 / ${report.stats.failed} 失败 / ${report.fieldIssues.length} 字段提示`);
  console.log(`输出: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`报告: ${path.relative(ROOT, OUT_REPORT)}`);
}

main();
