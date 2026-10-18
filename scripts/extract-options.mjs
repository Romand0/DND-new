#!/usr/bin/env node
/**
 * 离线提取脚本：从 DND5e_chm（GBK HTML）提取 种族/职业/背景 三域数据
 * 产出 src/data/options.json 种子 + stdout 校验报告
 *
 * 用法：
 *   node scripts/extract-options.mjs            # 全部三域
 *   node scripts/extract-options.mjs race       # 仅种族
 *   node scripts/extract-options.mjs class race # 任意组合
 *
 * 数据源只读：/workspace/data/DND5e_chm
 */
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHM = process.env.CHM_DIR || path.join(ROOT, 'data', 'DND5e_chm');
const PHB = path.join(CHM, '玩家手册');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'options.json');

const WARNINGS = [];
function warn(msg) {
  WARNINGS.push(msg);
  console.warn('  [警告] ' + msg);
}

// ---------- L1: 解码 + 归一化 ----------

function decodeGbk(file) {
  const buf = fs.readFileSync(file);
  try {
    return new TextDecoder('gb18030').decode(buf);
  } catch {
    const { execFileSync } = childProcess;
    return execFileSync('iconv', ['-f', 'GB18030', '-t', 'UTF-8', file], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  }
}

/** 把 Word 导出 HTML 归一化为带标记的行数组 */
function normalize(html) {
  // 表格先整体抽出，避免段落分隔符打碎行结构
  const tables = [];
  html = html.replace(/<table[\s\S]*?<\/table>/gi, (m) => {
    tables.push(m);
    return '\n«TABLE:' + (tables.length - 1) + '»\n';
  });

  html = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  // 1. 块级边界 → 哨兵 \x00（h 附带标题标记）；加粗 run 的配对以哨兵为界，
  //    防止未配对的游离 <b>（Word 伪影）吞掉半篇文档
  html = html
    .replace(/<h([1-6])[^>]*>/gi, '\x00«H$1»')
    .replace(/<\/h[1-6]>/gi, '«/H»\x00')
    .replace(/<p[^>]*>|<\/p>|<br[^>]*>|<div[^>]*>|<\/div>/gi, '\x00');

  // 2. 完整加粗 run 原子化（run 内禁止跨块；内联标签剥除、文本保留；
  //    Word 源码在文本里留有软换行，一并压成空格防止特质名再次跨行）
  html = html.replace(/<(b|strong)[^>]*>([^\x00]*?)<\/\1>/gi, (_, _tag, inner) => {
    return '«B»' + inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + '«/B»';
  });
  // 3. 未配对残留的 b 标签 + 其余所有标签剥除
  html = html.replace(/<\/?(b|strong)[^>]*>/gi, '');
  html = html.replace(/<[^>]+>/g, '');
  // 4. 相邻 run 拼接：特质名常被拆成 <b>中文</b><b>English</b> 两段
  html = html.replace(/«\/B»\s*«B»/g, '');

  html = html.replace(/\x00/g, '\n');
  html = decodeEntities(html);

  const lines = html
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0\u3000]+/g, ' ').trim())
    .filter((l) => l.length > 0);

  return { lines, tables };
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function stripBoldMarkers(s) {
  return s.replace(/«\/?B»/g, '').trim();
}

// ---------- L2: 分词 ----------

/** 单行文本 → [{header?, text}]：加粗运行若符合条目头模式则独立成段 */
function splitLineIntoSegments(line) {
  const re = /«B»([\s\S]*?)«\/B»/g;
  let last = 0;
  let m;
  const pieces = [];
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) pieces.push({ bold: false, text: line.slice(last, m.index) });
    pieces.push({ bold: true, text: m[1] });
    last = re.lastIndex;
  }
  if (last < line.length) pieces.push({ bold: false, text: line.slice(last) });

  const segs = [];
  let buf = '';
  const flush = () => {
    const t = stripBoldMarkers(buf).replace(/\s+/g, ' ').trim();
    if (t) segs.push({ header: false, text: t });
    buf = '';
  };
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (!p.bold) {
      buf += p.text;
      continue;
    }
    const headText = p.text.replace(/\s+/g, ' ').trim();
    const nextText = pieces.slice(i + 1).map((x) => x.text).join('');
    if (isTraitHeader(headText, nextText)) {
      flush();
      segs.push({ header: true, text: headText });
    } else {
      buf += headText;
    }
  }
  flush();
  return segs;
}

function isTraitHeader(t, following) {
  if (t.length < 2 || t.length > 80) return false;
  if (!/[\u4e00-\u9fff]/.test(t)) return false;
  // 句号收尾仅允许「英文名。」形态（如 亚种Subrace。——句号常被包进加粗 run）
  if (t.includes('。') && !/[A-Za-z)）]。$/.test(t)) return false;
  if (t.includes('，') || t.includes('、')) return false;
  // 字段标签：以冒号收尾（如 技能熟练项：/语言：/装备：）
  if (/[：:]$/.test(t) && t.length <= 20) return true;
  // 条目头以英文收尾（如 黑暗视觉Darkvision / 特性：信仰庇护Feature: Shelter of the Faithful）
  if (/[A-Za-z)）]。?$/.test(t)) return true;
  // 纯中文条目头：紧随其后的正文以 。 开头才算
  if (following.trim().startsWith('。')) return true;
  return false;
}

/** 中英混合标题拆分：特性：信仰庇护Feature: Shelter of the Faithful → {zh, en} */
function splitZhEn(s) {
  s = stripBoldMarkers(s);
  const m = s.match(/^([\u4e00-\u9fff·、：][\u4e00-\u9fff·、：（）]*?)\s*([A-Za-z][\s\S]*)$/);
  if (!m) return { zh: s, en: '' };
  return { zh: m[1].trim(), en: m[2].trim() };
}

// ---------- 表格解析 ----------

function parseTable(tableHtml) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(tableHtml)) !== null) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = tdRe.exec(m[1])) !== null) {
      const text = c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      cells.push(text);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// ---------- 机械字段解析 ----------

const ABILITY_ZH = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];
const ABILITY_EN_MAP_ZH = {
  力量: 'strength',
  敏捷: 'dexterity',
  体质: 'constitution',
  智力: 'intelligence',
  感知: 'wisdom',
  魅力: 'charisma',
};

function parseAbilityBonus(text) {
  // 特例：人类「全部属性值加1」
  if (/全部属性值加\s*1/.test(text) || /六项属性值/.test(text)) {
    return Object.fromEntries(ABILITY_ZH.map((a) => [a, 1]));
  }
  const bonus = {};
  const re = /([\u4e00-\u9fff]{2})(?:值)?加(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (ABILITY_ZH.includes(m[1])) bonus[m[1]] = (bonus[m[1]] || 0) + Number(m[2]);
  }
  return Object.keys(bonus).length ? bonus : null;
}

function parseSpeed(text) {
  const m = text.match(/步行速度为\s*(\d+)\s*尺/);
  return m ? Number(m[1]) : null;
}

function parseSize(text) {
  const m = text.match(/(微型|小型|中型|大型|巨型)(体型)?/);
  return m ? m[1] : null;
}

function parseDarkvision(text) {
  if (!text.includes('黑暗视觉')) return null;
  const m = text.match(/(\d+)\s*尺/);
  return m ? Number(m[1]) : 60;
}

function parseSaves(text) {
  // 独立字段形态：「豁免：」header 后的纯列表（如 力量、体质 / 感知，魅力）
  const list = text.match(
    /^(力量|敏捷|体质|智力|感知|魅力)((?:[、，,](力量|敏捷|体质|智力|感知|魅力))+)$/
  );
  if (list) {
    const saves = [list[1]];
    const re = /[、，,](力量|敏捷|体质|智力|感知|魅力)/g;
    let m;
    while ((m = re.exec(text)) !== null) saves.push(m[1]);
    return [...new Set(saves)].map((a) => ABILITY_EN_MAP_ZH[a]);
  }
  // 行内形态：熟练项正文中的「豁免：力量、体质」
  const m = text.match(
    /豁免[：:]\s*((?:力量|敏捷|体质|智力|感知|魅力)(?:、(?:力量|敏捷|体质|智力|感知|魅力))*)/
  );
  if (m) {
    return [...new Set(m[1].split(/[、，,]/))].map((a) => ABILITY_EN_MAP_ZH[a]);
  }
  return null;
}

// ---------- L2.5: 文档流 → 块序列 ----------

function extractBlocks(lines, tables) {
  const blocks = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const tm = line.match(/^«TABLE:(\d+)»$/);
    if (tm) {
      blocks.push({ kind: 'table', rows: parseTable(tables[Number(tm[1])]) });
      continue;
    }
    // 标题可能跨物理行（Word 源码在 </b><b> 间留软换行），向后吞到 «/H» 为止
    if (/^«H\d»/.test(line)) {
      let text = line;
      let guard = 0;
      while (!/«\/H»\s*$/.test(text) && li + 1 < lines.length && guard < 3) {
        text += ' ' + lines[++li];
        guard++;
      }
      const hm = text.match(/^«H(\d)»([\s\S]*?)(?:«\/H»)?$/);
      const headingText = stripBoldMarkers(hm[2].replace(/«\/H»/g, '')).trim();
      blocks.push({ kind: 'heading', level: Number(hm[1]), text: headingText });
      // 背景域的特性标题以 h4 形态出现，同步补一条 header 块供特征收集
      if (headingText.startsWith('特性')) {
        blocks.push({ kind: 'header', text: headingText });
      }
      continue;
    }
    for (const seg of splitLineIntoSegments(line)) {
      blocks.push({ kind: seg.header ? 'header' : 'text', text: seg.text });
    }
  }
  return blocks;
}

// ---------- 种族域 ----------

// 亚种排除表：书源归属存疑的条目
const SUBRACE_EXCLUDE = {
  矮人: ['灰矮人'],
  侏儒: ['地底侏儒'],
  龙裔: ['罕见种族'],
  精灵: [],
};
const SUBRACE_EXCLUDE_SOURCE = { 灰矮人: '怪物图鉴', 地底侏儒: '多元宇宙的怪物', 罕见种族: '多元宇宙的怪物' };

function extractRaces() {
  const dir = path.join(PHB, '种族');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && f !== '种族.html');
  const races = [];
  console.log(`\n=== 种族域：${files.length} 个文件 ===`);

  for (const file of files) {
    const { lines, tables } = normalize(decodeGbk(path.join(dir, file)));
    const blocks = extractBlocks(lines, tables);

    const h2 = blocks.find((b) => b.kind === 'heading' && b.level === 2);
    if (!h2) {
      warn(`种族/${file}: 无 h2 标题，跳过`);
      continue;
    }
    const { zh: raceName, en: raceEn } = splitZhEn(h2.text);

    // 特质块起点：名为 xx特质 的 header
    const traitStart = blocks.findIndex(
      (b) => b.kind === 'header' && /特质/i.test(b.text) && /Traits/i.test(b.text)
    );
    if (traitStart < 0) {
      warn(`种族/${file}: 未找到特质块，跳过`);
      continue;
    }
    // 特质块之后第一个 h4 = 亚种候选分界（实际成立与否由「是否紧跟属性值加成」决定）
    let subraceStart = -1;
    for (let i = traitStart; i < blocks.length; i++) {
      if (blocks[i].kind === 'heading' && blocks[i].level === 4) {
        subraceStart = i;
        break;
      }
    }

    // 预计算每个 header 的下一个 header 名（用于亚种切换判定）
    const seq = blocks.slice(traitStart);
    const headerIdx = [];
    seq.forEach((b, i) => {
      if (b.kind === 'header') headerIdx.push(i);
    });
    const nextHeaderName = new Map();
    for (let k = 0; k < headerIdx.length; k++) {
      const cur = seq[headerIdx[k]];
      let next = '';
      if (k + 1 < headerIdx.length) {
        // 两个 header 之间隔着标题行 = 跨节边界，视为无关联
        const between = seq.slice(headerIdx[k] + 1, headerIdx[k + 1]);
        if (!between.some((b) => b.kind === 'heading')) {
          next = splitZhEn(seq[headerIdx[k + 1]].text).zh;
        }
      }
      nextHeaderName.set(cur, next);
    }

    const isAbilityHeader = (name) => /属性值(加成|提升)/.test(name);

    const baseTraits = [];
    const subraces = new Map();
    let curSub = null;
    let curTrait = null;
    let pendingH4 = null; // 未落定的 h4 候选
    let junkMode = false; // 人名表止损：进入后丢弃一切直到下一个结构锚点

    const container = () => (curSub ? curSub.traits : baseTraits);
    const addTrait = (t) => {
      if (!t) return;
      if (/特质/i.test(t.name) && /Traits/i.test(t.nameEn || '')) return; // 块标题自身
      container().push(t);
    };
    const makeSub = (nameText, kind) => {
      let { zh, en } = splitZhEn(nameText);
      if (/特质$/.test(zh) && /Traits/i.test(en)) zh = zh.replace(/特质$/, ''); // 变体人类特质→变体人类
      en = en.replace(/[\u4e00-\u9fff（）][\s\S]*$/, '').trim();
      const sub = { id: slug(en || zh), name: zh, nameEn: en, mechanics: {}, traits: [], source: '玩家手册 2014' };
      subraces.set(zh, sub);
      console.log(`    亚种切换[${kind}]：${zh}`);
      return sub;
    };

    for (let i = 0; i < seq.length; i++) {
      const b = seq[i];
      if (b.kind === 'heading') {
        junkMode = false;
        if (b.level === 4 && subraceStart >= 0) {
          pendingH4 = b;
        }
        continue;
      }
      if (b.kind === 'table') {
        curTrait = null;
        continue;
      }
      if (b.kind === 'header') {
        junkMode = false;
        const { zh, en } = splitZhEn(b.text);
        if (pendingH4) {
          if (isAbilityHeader(zh)) {
            // h4 候选 + 属性值加成 → 成立亚种
            curSub = makeSub(pendingH4.text, 'h4');
            pendingH4 = null;
          } else {
            // h4 段首无属性加成 → 风味节，候选作废
            pendingH4 = null;
          }
        } else if (
          !isAbilityHeader(zh) &&
          isAbilityHeader(nextHeaderName.get(b) || '') &&
          container().some((t) => isAbilityHeader(t.name))
        ) {
          // 加粗头切换亚种（如 精灵.html 中 木精灵 嵌在高等级 h4 段内）：
          // 任一特质头若紧跟着一个属性值加成头，且当前容器已有属性加成，即为亚种边界
          curSub = makeSub(b.text, 'bold');
          curTrait = { name: zh, nameEn: en, text: '' };
          addTrait(curTrait);
          continue;
        }
        curTrait = { name: zh, nameEn: en, text: '' };
        addTrait(curTrait);
        continue;
      }
      // text 块
      if (junkMode) continue;
      const t = b.text;
      if (isNamesFlavor(t)) {
        junkMode = true;
        if (curTrait) curTrait.text = curTrait.text.replace(/\s*[\u4e00-\u9fff]*姓名.*$/s, '').trim();
        continue;
      }
      if (curTrait) curTrait.text += (curTrait.text ? ' ' : '') + t.replace(/^[。、：；]+/, '');
    }

    // 文件尾种族导航链接（属性值加成之后出现的其他种族名 bold 头）剔除
    const raceNames = new Set(files.map((f) => f.replace('.html', '')));
    const isNavLink = (t) => raceNames.has(t.name);

    // 亚种排除（书源归属）
    const excl = SUBRACE_EXCLUDE[raceName] || [];
    for (const s of subraces.values()) {
      if (excl.includes(s.name)) {
        warn(`种族/${raceName}: 亚种「${s.name}」按配置排除（${SUBRACE_EXCLUDE_SOURCE[s.name] || ''}）`);
        subraces.delete(s.name);
      }
    }

    // 校验
    baseTraitsClean(baseTraits, isNavLink);
    if (!baseTraits.some((t) => t.name.includes('属性值加成'))) {
      warn(`种族/${file}: 未提取到属性值加成，疑似概览页，丢弃`);
      continue;
    }
    for (const t of [...baseTraits, ...[...subraces.values()].flatMap((s) => s.traits)]) {
      if (!t.text) warn(`种族/${raceName}: 特质「${t.name}」无描述`);
      if (!t.nameEn) warn(`种族/${raceName}: 特质「${t.name}」缺英文名`);
    }

    // 风味引言：h2 与特质块之间的文本（截 300 字，跳过引言斜体块）
    let flavor = '';
    for (const b of blocks) {
      if (b.kind === 'heading' && b !== h2) break;
      if (b.kind === 'text') flavor += b.text + ' ';
      if (flavor.length > 400) break;
    }
    flavor = flavor.replace(/\s+/g, ' ').trim().slice(0, 300);

    // 机械字段来自基础特质
    const mechanics = {};
    for (const t of baseTraits) {
      if (t.name.includes('属性值加成')) mechanics.abilityBonus = parseAbilityBonus(t.text);
      if (t.name.includes('体型')) mechanics.size = parseSize(t.text);
      if (t.name.includes('速度')) mechanics.speed = parseSpeed(t.text);
      if (/darkvision/i.test(t.nameEn)) mechanics.darkvision = parseDarkvision(t.text);
      if (t.name.includes('语言') && t.nameEn.toLowerCase().startsWith('language')) mechanics.languages = t.text.slice(0, 200);
    }

    const race = {
      id: slug(raceEn || raceName),
      name: raceName,
      nameEn: raceEn,
      category: 'race',
      parentName: '',
      source: '玩家手册 2014',
      mechanics,
      traits: baseTraits,
      subraces: [...subraces.values()],
      flavor: flavor || undefined,
      dataResource: '5E不全书',
    };

    console.log(
      `  ${raceName}：特质 ${baseTraits.length}，亚种 [${race.subraces.map((s) => s.name).join('/')}]`
    );
    races.push(race);
  }
  return races;
}

function isNamesFlavor(text) {
  return /姓名/.test(text) && /Names/i.test(text);
}

/** 剔除伪特质：文件尾种族导航链接、指向亚种列表的「亚种」介绍段（纯引导，无机械内容） */
function baseTraitsClean(traits, isNavLink) {
  for (let i = traits.length - 1; i >= 0; i--) {
    if (isNavLink(traits[i]) || traits[i].name === '亚种') traits.splice(i, 1);
  }
}

// ---------- 背景域 ----------

function extractBackgrounds() {
  const dir = path.join(PHB, '个性与背景');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.includes('第'));
  const backgrounds = [];
  console.log(`\n=== 背景域：${files.length} 个候选文件 ===`);

  for (const file of files) {
    const { lines, tables } = normalize(decodeGbk(path.join(dir, file)));
    const blocks = extractBlocks(lines, tables);
    const features = collectFeatures(blocks);

    const skillF = features.find((f) => f.name.includes('技能熟练项'));
    const toolF = features.find((f) => f.name.includes('工具熟练项'));
    const langF = features.find((f) => f.name.includes('语言'));
    const equipF = features.find((f) => f.name === '装备' || f.name === '装备Equipment');
    const featureF = features.find((f) => f.name.startsWith('特性'));
    if (!featureF) continue; // 章节总览等非背景文件

    const displayName = file.replace('.html', '');
    const { zh: bgName, en: bgEn } = splitZhEn(displayName);

    const bg = {
      id: slug(bgEn || bgName),
      name: bgName,
      nameEn: bgEn,
      category: 'background',
      parentName: '',
      source: '玩家手册 2014',
      mechanics: {
        skills: skillF ? skillF.text.slice(0, 120) : '',
        tools: toolF ? toolF.text.slice(0, 120) : undefined,
        languages: langF ? langF.text.slice(0, 120) : '',
      },
      equipment: equipF ? equipF.text : '',
      feature: {
        name: featureF.name.replace(/^特性[：:]\s*/, ''),
        nameEn: featureF.nameEn,
        text: featureF.text,
      },
      description: '',
      dataResource: '5E不全书',
    };

    // 描述 = 首段长文本
    const firstText = blocks.find((b) => b.kind === 'text' && b.text.length > 30);
    bg.description = firstText ? firstText.text.replace(/\s+/g, ' ').slice(0, 500) : '';

    // 建议特征表（d8/d6）：起始锚点可能是 header 或 h4 heading
    const charTables = [];
    let inChars = false;
    for (const b of blocks) {
      if ((b.kind === 'header' || b.kind === 'heading') && /建议特征/i.test(b.text)) inChars = true;
      else if (b.kind === 'header' || b.kind === 'heading') inChars = false;
      else if (b.kind === 'table' && inChars) charTables.push(b.rows);
    }
    if (charTables.length) bg.characteristics = charTables.map(parseCharTable).filter(Boolean);

    if (!bg.mechanics.skills) warn(`背景/${file}: 未提取到技能熟练项`);
    if (!bg.feature.text) warn(`背景/${file}: 特性描述为空`);
    console.log(
      `  ${bg.name}：特性「${bg.feature.name}」${bg.characteristics ? `，特征表 ${bg.characteristics.length} 组` : ''}`
    );
    backgrounds.push(bg);
  }
  return backgrounds;
}

/** 按最近 header 收集描述：{name, en, text, context}[] */
function collectFeatures(blocks) {
  const features = [];
  let cur = null;
  for (const b of blocks) {
    if (b.kind === 'header') {
      if (cur) features.push(cur);
      const { zh, en } = splitZhEn(b.text);
      cur = { name: zh, nameEn: en, text: '' };
    } else if (b.kind === 'text' && cur) {
      cur.text += (cur.text ? ' ' : '') + b.text.replace(/^[。、：；]+/, '');
    } else if (cur && (b.kind === 'heading' || b.kind === 'table')) {
      features.push(cur);
      cur = null;
    }
  }
  if (cur) features.push(cur);
  for (const f of features) {
    f.text = f.text.replace(/^[。\s：:]+/, '').trim();
  }
  return features;
}

/** 建议特征表：[[d8,特点],[1,文本]...] → {die, kind, entries[]} */
function parseCharTable(rows) {
  if (rows.length < 3) return null;
  const die = /^d(\d+)$/i.test(rows[0][0] || '') ? rows[0][0].toLowerCase() : null;
  if (!die) return null;
  const kind = rows[1][0] || '';
  const entries = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (r.length >= 2 && /^\d+$/.test(r[0].trim())) entries.push(r.slice(1).join(' ').trim());
    else if (entries.length && r.length >= 1) entries[entries.length - 1] += ' ' + r.join(' ').trim();
  }
  return { die, kind, entries };
}

// ---------- 职业域 ----------

function extractClasses() {
  const dir = path.join(PHB, '职业');
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const classFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.html'));
  const classes = [];
  console.log(`\n=== 职业域：${classFiles.length} 个候选文件 ===`);

  for (const e of classFiles) {
    // 章节概览页
    if (e.name === '职业.html') continue;
    // 吟游诗人1.html 为 CHM 冗余副本，与 吟游诗人.html 内容一致
    if (e.name === '吟游诗人1.html') continue;
    const { lines, tables } = normalize(decodeGbk(path.join(dir, e.name)));
    const blocks = extractBlocks(lines, tables);
    const headings = blocks.filter((b) => b.kind === 'heading');
    const h2 = headings.find((h) => h.level === 2);
    if (!h2) {
      warn(`职业/${e.name}: 无 h2，跳过`);
      continue;
    }
    const { zh: className, en: classEn } = splitZhEn(h2.text);

    // 职业表：表头含 职业等级 的第一张表（单元格内换行被压缩成空格，先归一化）
    const tableBlock = blocks.find(
      (b) =>
        b.kind === 'table' &&
        b.rows.length > 5 &&
        b.rows[0].some((c) => c.replace(/\s/g, '').includes('职业等级'))
    );
    let table = null;
    if (tableBlock) {
      // 双行表头（法师/吟游诗人等「每环法术位」合并列）：row1 为 1环~9环 子列，
      // 合并为单表头——前段列取 row0，环阶段取 row1
      let rows = tableBlock.rows;
      const isRingRow = (r) =>
        r.filter((c) => /^[一二三四五六七八九1-9]\s*环$/.test(String(c).replace(/\s/g, ''))).length >= 5;
      if (rows.length > 2 && isRingRow(rows[1])) {
        // row0 末列「每环法术位」是跨列组标题（colSpan 未展开），由 row1 的环阶列替代
        const merged = [...rows[0].slice(0, -1), ...rows[1]];
        rows = [merged, ...rows.slice(2)];
      }
      const header = rows[0];
      const idx = { level: -1, prof: -1, features: -1, slots: {} };
      header.forEach((c, i) => {
        const col = String(c).replace(/\s/g, '');
        if (col.includes('职业等级')) idx.level = i;
        else if (col.includes('熟练加值')) idx.prof = i;
        else if (col.includes('职业特性')) idx.features = i;
        else if (/^[一二三四五六七八九1-9]环/.test(col)) idx.slots[i] = col;
      });
      table = rows
        .slice(1)
        .map((r) => {
          const row = {
            level: parseInt(r[idx.level], 10) || 0,
            proficiency: parseInt(String(r[idx.prof]).replace('+', ''), 10) || 0,
            features: [],
          };
          if (idx.features >= 0 && r[idx.features]) {
            row.features = r[idx.features]
              .split(/[，,]/)
              .map((s) => s.trim())
              .filter((s) => s && s !== '－' && s !== '—');
          }
          const slots = {};
          for (const [i, label] of Object.entries(idx.slots)) {
            const v = r[Number(i)];
            if (v && v !== '—' && v !== '-') slots[label] = v;
          }
          if (Object.keys(slots).length) row.slots = slots;
          return row;
        })
        .filter((r) => r.level > 0);
    } else {
      warn(`职业/${e.name}: 未找到职业表`);
    }

    const features = collectFeatures(blocks);
    const find = (kw) => features.find((f) => f.name.includes(kw));

    const hpF = find('生命骰');
    const profF = find('熟练项');
    const equipF = find('装备');
    const saveF = find('豁免');
    const hitDie = hpF ? (hpF.text.match(/1d(\d+)/) || [])[1] : null;

    // 职业特性：每个职业在职业特性区之前有两段叙事 flavor（如「音乐与魔法/从经验中
    // 学习」）和一段「创建XXX」快速建卡引导，全部从「创建XXX」之后截取；德鲁伊语/
    // 专精/盗贼黑话等 1 级真特性位于其后，不受影响。无「创建XXX」时退化为仅排结构段
    const structural = ['生命值', '生命骰', '熟练项', '装备', '快速建卡', '职业特性', '职业表', '施法', '法术'];
    const createIdx = features.findIndex((f) => /^(创建|创造)/.test(f.name));
    const featureSource = createIdx >= 0 ? features.slice(createIdx + 1) : features;
    const classFeatures = featureSource
      .filter((f) => f.text && !structural.some((s) => f.name.includes(s)) && f.nameEn)
      .map((f) => ({
        ...f,
        // 生效等级：从文本首个「第X级」解析（如「从第1级起」「第4、8、12级」「第4、
        // 第6、第19级」三种形态都要命中首个数字），无等级标注的一律为 1 级特性
        // （PHB 1 级特性普遍不带等级前缀；「第10章」等章节引用因无「级」后缀不会误匹配）
        level: Number((f.text.match(/第\s*(\d+)(?:\s*[、，,]\s*第?\s*\d+)*\s*级/) || [])[1] || 1),
      }));

    // h4 子选项（战斗风格等）挂回所属特性
    const optionsByCtx = new Map();
    for (const h of headings) {
      if (h.level === 4 && h.text && h.text !== h2.text) {
        const { zh, en } = splitZhEn(h.text);
        optionsByCtx.set(h.text, { name: zh, nameEn: en });
      }
    }
    for (const f of classFeatures) {
      // collectFeatures 丢了 context，改由名字顺序近似：战斗风格选项在 h4 下
      // 简化：跳过 optionOf 归属，v1 以 optionOf=false 全部平铺
      f.optionOf = undefined;
    }

    const cls = {
      id: slug(classEn || className),
      name: className,
      nameEn: classEn,
      category: 'class',
      parentName: '',
      source: '玩家手册 2014',
      mechanics: {
        hitDie: hitDie ? Number(hitDie) : null,
        savingThrows: parseSaves(saveF ? saveF.text : '') || [],
        proficiencies: profF ? profF.text.slice(0, 400) : '',
        startingEquipment: equipF ? equipF.text.slice(0, 500) : '',
      },
      table: table || [],
      features: classFeatures.map((f) => ({
        name: f.name,
        nameEn: f.nameEn,
        text: f.text,
        level: f.level,
      })),
      subclasses: [],
      dataResource: '5E不全书',
    };

    if (!hitDie) warn(`职业/${className}: 未解析到生命骰`);
    if (cls.mechanics.savingThrows.length === 0) warn(`职业/${className}: 未解析到豁免`);
    if (cls.table.length < 10) warn(`职业/${className}: 职业表仅 ${cls.table.length} 行`);
    console.log(`  ${className}：d${hitDie}，表 ${cls.table.length} 行，特性 ${classFeatures.length} 条`);

    // 子职业文件
    const subDir = path.join(dir, className);
    if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
      const subFiles = fs.readdirSync(subDir).filter((f) => f.endsWith('.html'));
      for (const sf of subFiles) {
        const sub = extractSubclass(subDir, sf, className);
        if (sub) cls.subclasses.push(sub);
      }
      console.log(`    子职业：[${cls.subclasses.map((s) => s.name).join('/')}]`);
    }
    classes.push(cls);
  }
  return classes;
}

function extractSubclass(dir, file, parentName) {
  const { lines, tables } = normalize(decodeGbk(path.join(dir, file)));
  const blocks = extractBlocks(lines, tables);

  // 子职业名：首个「带等级」L4 特性之前最后一个不以「。」结尾的 header/L2。
  // 文件名不可靠（CHM 存在文件名与内容错位）；以「。」收尾的 header 是无等级选项
  // 条目（链之魔契Pact of the Chain。/ 战技Maneuvers。），排除
  const isLeveledL4 = (i) => {
    const b = blocks[i];
    return (
      b.kind === 'heading' &&
      b.level >= 4 &&
      blocks.slice(i + 1).some((n) => n.kind === 'text' && /第\s*\d+\s*级/.test(n.text)) === true &&
      blocks[i + 1] &&
      blocks[i + 1].kind === 'text' &&
      /第\s*\d+\s*级/.test(blocks[i + 1].text)
    );
  };
  const firstL4 = blocks.findIndex((_, i) => isLeveledL4(i));
  const beforeFeature = firstL4 >= 0 ? blocks.slice(0, firstL4) : blocks;
  // 名字候选：不以「。」收尾、且紧随正文不以「。」开头（排除信条/选项词条，
  // 如 诚实Honesty→。不诳语、链之魔契Pact of the Chain。）
  const nameBlock = [...beforeFeature]
    .reverse()
    .find((b, ri) => {
      if (b.kind !== 'header' || !/[\u4e00-\u9fff]/.test(b.text)) return false;
      if (/[。．]$/.test(b.text)) return false;
      const bi = beforeFeature.length - 1 - ri;
      const next = blocks[bi + 1];
      return !(next && next.kind === 'text' && next.text.startsWith('。'));
    });
  const l2 = beforeFeature.find((b) => b.kind === 'heading' && b.level === 2);
  const nameText = nameBlock ? nameBlock.text : l2 && l2.text;
  if (!nameText) return null;
  const { zh: subName, en: subEn } = splitZhEn(nameText.replace(/[。．]$/, ''));

  // 特性以 L4 heading 出现，等级嵌在正文（如「从你第3级选择此范型起」）
  const features = [];
  let cur = null;
  let droppedNoLevel = 0;
  const flush = () => {
    if (!cur) return;
    const m = cur.text.match(/第\s*(\d+)\s*级/);
    if (m) {
      features.push({ name: cur.name, nameEn: cur.nameEn, text: cur.text, level: Number(m[1]) });
    } else if (cur.name) {
      droppedNoLevel++;
    }
    cur = null;
  };
  for (const b of blocks) {
    if (b.kind === 'heading' && b.level >= 4) {
      flush();
      const { zh, en } = splitZhEn(b.text);
      cur = { name: zh, nameEn: en, text: '' };
    } else if (b.kind === 'heading' || b.kind === 'header' || b.kind === 'table') {
      flush();
    } else if (b.kind === 'text' && cur) {
      cur.text += (cur.text ? ' ' : '') + b.text.replace(/^[。、：；]+/, '');
    }
  }
  flush();

  if (!features.length) {
    warn(`子职业/${parentName}/${file}: 无带等级的特性，跳过（概览页，丢弃无等级条目 ${droppedNoLevel} 条）`);
    return null;
  }

  return {
    id: slug(subEn || subName),
    name: subName,
    nameEn: subEn,
    category: 'subclass',
    parentName,
    source: '玩家手册 2014',
    features,
    dataResource: '5E不全书',
  };
}

// ---------- 工具 ----------

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------- 入口 ----------

function main() {
  if (!fs.existsSync(PHB)) {
    console.error(
      `数据源不存在：${CHM}\n先执行 git clone --depth 1 https://github.com/DND5eChm/DND5e_chm ${CHM}`
    );
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const want = (d) => args.length === 0 || args.includes(d);

  // 部分域运行时与既有产出合并
  let out = {};
  if (fs.existsSync(OUT_FILE)) {
    try {
      out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch {
      out = {};
    }
  }
  if (want('race')) out.races = extractRaces();
  if (want('background')) out.backgrounds = extractBackgrounds();
  if (want('class')) out.classes = extractClasses();

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1), 'utf8');
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);

  console.log(`\n=== 产出 ${path.relative(ROOT, OUT_FILE)}（${kb} KB）===`);
  console.log(
    `种族 ${out.races?.length ?? '-'} | 背景 ${out.backgrounds?.length ?? '-'} | 职业 ${out.classes?.length ?? '-'}`
  );
  if (WARNINGS.length) {
    console.log(`\n=== ${WARNINGS.length} 条警告 ===`);
    process.exitCode = 1;
  }
}

main();
