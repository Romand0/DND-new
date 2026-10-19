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

function parseTypeLine(line) {
  // 「中型类人（兽人），混乱邪恶」/「大型野兽，中立」/「巨型构造体，通常中立（绝对守序）」
  const sizeMatch = line.match(/^([微小中大超巨]型)/);
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

/** 动作区条目 → NpcAttack（武器攻击行）或 traits（非攻击条目） */
function parseActionsAndTraits(cardLines, file, cardName) {
  const attacks = [];
  const traits = [];
  let inAction = false;
  for (const line of cardLines) {
    if (/^(动作|Actions)$/.test(line) || /^动作Actions$/.test(line)) { inAction = true; continue; }
    if (/^(附赠动作|反应|传奇动作)/.test(line)) { inAction = true; continue; }
    const atk = parseAttackLine(line);
    if (atk) { attacks.push(atk); continue; }
    const tm = line.match(/^([\u4e00-\u9fa5]{1,12}[A-Za-z'’\- ]*)(?:（([0-9\/日\/周]+[^）]*)）)?。\s*(.+)$/);
    if (tm && tm[3] && tm[3].length > 6) {
      traits.push({ name: (tm[1] || '').trim(), text: `${tm[2] ? `（${tm[2]}）` : ''}${tm[3].trim()}`.trim() });
    }
  }
  return { attacks, traits };
}

function parseAttackLine(line) {
  // 「巨斧Greataxe。近战武器攻击：命中+6，触及5尺，单一目标。命中：15（1d12+4外加1d8）点挥砍伤害。」
  if (!/武器攻击[:：]/.test(line)) return null;
  const nameM = line.match(/^([\u4e00-\u9fa5]{1,12})([A-Za-z'’\- ]*)(?:（[^）]*）)?。\s*/);
  const name = nameM ? nameM[1] : '';
  const nameEn = nameM && nameM[2] ? nameM[2].trim() : '';
  const bonusM = line.match(/命中\s*([+\-]\d{1,2})/);
  const reachM = line.match(/触及\s*(\d{1,3})\s*尺/);
  const rangeM = line.match(/射程\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*尺/);
  const dmgM = line.match(/命中[:：]\s*\d{1,3}\s*（([0-9dD+\-\s外加]+?)）\s*点\s*(\S{2,4}?)伤害/);
  const saveHitM = line.match(/命中[:：]\s*([^。]{2,80})。/);
  const afterDmgM = line.match(/点[\u4e00-\u9fa5]{2,4}伤害[，。]?\s*(.*)$/);
  const isRanged = /远程/.test(line);
  let normalRange = reachM ? parseInt(reachM[1], 10) : undefined;
  let maxRange = normalRange;
  if (rangeM) { normalRange = parseInt(rangeM[1], 10); maxRange = parseInt(rangeM[2], 10); }
  if (normalRange === undefined) { normalRange = 5; maxRange = 5; }
  const parenDice = dmgM ? dmgM[1].replace(/\s+/g, '').toLowerCase() : '';
  const diceOnly = (parenDice.match(/\d+d\d+(?:[+\-]\d+)?/) || [])[0] || parenDice;
  const extraDice = parenDice.slice(diceOnly.length).trim();
  const twoHandM = line.match(/双手[^。]*?攻击时\s*\d{1,3}\s*（([0-9dD+\-]+)）/);
  const twoHandedDamage = twoHandM ? twoHandM[1].toLowerCase() : undefined;
  const damageType = dmgM ? dmgM[2] : '';
  const damage = diceOnly;
  if (!damage && dmgM) fieldIssue('', name, 'attack.damage', line.slice(0, 60));
  const props = [];
  if (/双手/.test(line)) props.push('多用');
  if (/装填/.test(line)) props.push('装填');
  if (/精细/.test(line)) props.push('精细');
  if (/轻/.test(line)) props.push('轻');
  const afterText = afterDmgM && afterDmgM[1] ? afterDmgM[1].trim() : '';
  const note = [extraDice, afterText].filter(Boolean).join('；').slice(0, 200) ||
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
  const map = { 微型: 0, 小型: 1, 中型: 2, 大型: 3, 巨型: 4, 超巨型: 5 };
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
    const joined = card.lines.map((_, i) => joinNext(card.lines, i));
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
