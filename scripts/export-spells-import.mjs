/**
 * 法术导入数据本地预生成：绕开 Workers 10ms CPU 限额（cheerio load 大 HTML 在 Functions 内超限，
 * 仅 17K 的戏法文件能过线）。
 *
 * 用法: node scripts/export-spells-import.mjs
 * 输出: spells-import/<环数>.json（每环一个 JSON 数组，与 /api/import/spells GET 预览产出逐字一致）
 *       数据管理页「从 JSON 直接导入」面板粘贴导入。
 *
 * 逻辑与 functions/api/import/spells.ts GET 段逐行同构（含 TABLE → Wikidot table 提取）。
 * 源: data/DND5e_chm/玩家手册/魔法/法术详述/<环数>.html（gb18030）
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import * as cheerio from 'cheerio';

const dec = new TextDecoder('gb18030', { fatal: false });
const DIR = 'data/DND5e_chm/玩家手册/魔法/法术详述';
const OUT = 'spells-import';

const LEVEL_MAP = {
  '戏法': 0, '一环': 1, '二环': 2, '三环': 3, '四环': 4,
  '五环': 5, '六环': 6, '七环': 7, '八环': 8, '九环': 9,
};
const SCHOOL_MAP = {
  '防护': 'abjuration', '塑能': 'evocation', '惑控': 'enchantment',
  '咒法': 'conjuration', '幻术': 'illusion', '死灵': 'necromancy',
  '变化': 'transmutation', '预言': 'divination',
};

function parseComponents(compStr) {
  const cleaned = compStr.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return {
    verbal: cleaned.includes('V'),
    somatic: cleaned.includes('S'),
    material: cleaned.includes('M'),
  };
}

function extractMaterialInfo(compStr) {
  const m = compStr.match(/M[（(]([\s\S]+?)[)）]/);
  return m ? m[1].trim() : '';
}

function cleanText(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** HTML 表格 → Wikidot 语法（与导入器同构；首行 TR = 表头） */
function htmlTableToWikidot(tableHtml) {
  const cellText = (td) =>
    td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [];
  const trRe = /<TR[\s\S]*?<\/TR>/gi;
  let trM;
  while ((trM = trRe.exec(tableHtml)) !== null) {
    const cells = [];
    const tdRe = /<T[D H][^>]*>[\s\S]*?<\/T[D H]>/gi;
    let tdM;
    while ((tdM = tdRe.exec(trM[0])) !== null) cells.push(cellText(tdM[0]));
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (r) => Array.from({ length: colCount }, (_, i) => r[i] ?? '');
  return [
    `|| ${pad(rows[0]).join(' || ')} ||`,
    ...rows.slice(1).map((r) => `| ${pad(r).join(' | ')} |`),
  ].join('\n');
}

const FIELD_SPACER = (s) => s
  .replace(/(\d)([\u4e00-\u9fff])/g, '$1 $2')
  .replace(/([\u4e00-\u9fff])(\d)/g, '$1 $2');
const CN_EN_SPACER = (s) => s
  .replace(/([\u4e00-\u9fff])([a-zA-Z])/g, '$1 $2')
  .replace(/([a-zA-Z])([\u4e00-\u9fff])/g, '$1 $2');

function parseRingHtml(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const spells = [];

  $('h4').each((_, el) => {
    const $h4 = $(el);
    const rawId = $h4.attr('id') || '';
    const id = rawId.toLowerCase().replace(/_/g, '-');

    const fullText = $h4.text().trim();
    const nameParts = fullText.split('｜');
    const name = nameParts.length > 1 ? nameParts[0].trim() : fullText;

    const $blockNodes = $h4.nextUntil('h4');
    if (!$blockNodes.length) return;
    const mainHtml = $blockNodes.map((_, n) => $.html(n)).get().join('');
    const $mainP = $blockNodes.filter('p').first();
    if (!$mainP.length) return;

    const emText = $mainP.find('em').text().trim();
    const emTokens = emText.split(/\s+/);
    let levelToken = '', schoolToken = '';
    for (const t of emTokens) {
      const cleanT = t.replace(/[（(].*$/, '');
      if (LEVEL_MAP[cleanT] !== undefined) levelToken = cleanT;
      else if (SCHOOL_MAP[cleanT] !== undefined) schoolToken = cleanT;
    }
    const level = levelToken ? LEVEL_MAP[levelToken] : -1;
    if (level === -1) return;
    let schoolName = schoolToken || '未知';
    schoolName = schoolName.replace('惑控', '附魔');

    const isRitual = emText.includes('仪式');

    const classesMatch = emText.match(/（(.+?)）/);
    const classesStr = classesMatch ? classesMatch[1] : '';
    let cleaned = classesStr.replace(/^仪式；/, '');
    const partsBySemicolon = cleaned.split(/[；;]/).map(s => s.trim()).filter(s => !s.includes('TCE：'));
    const rawClasses = partsBySemicolon.join('、').split('、').filter(Boolean);
    const mappedClasses = rawClasses
      .map(c => c === '魔契师' ? '邪术师' : c)
      .filter(c => c !== '奇械师');
    if (mappedClasses.length === 0) return;

    let castingTime = '', rng = '', compStr = '', duration = '';
    const fieldRe = /<(STRONG|b)>(施法时间|施法距离|法术成分|持续时间)：<\/\1>([\s\S]*?)<BR\s*\/?>/gi;
    let fm;
    while ((fm = fieldRe.exec(mainHtml)) !== null) {
      const label = fm[2];
      const val = fm[3].replace(/<[^>]+>/g, '').trim();
      if (label === '施法时间') castingTime = val;
      else if (label === '施法距离') rng = val;
      else if (label === '法术成分') compStr = val;
      else if (label === '持续时间') duration = val;
    }

    const components = parseComponents(compStr);
    const materialInfo = extractMaterialInfo(compStr);
    const isConcentration = duration.includes('专注');

    let hasHeightened = false;
    let heightenedEffect = '';
    const heightReg = /升环施法。([\s\S]*?)(?:<\/?(?:P|FONT|UL)[^>]*>|$)/i;
    const inMainMatch = mainHtml.match(heightReg);
    const $nextP = $mainP.next('p');
    const nextHtml = $nextP.length ? ($nextP.html() || '') : '';
    const inNextMatch = nextHtml.match(heightReg);
    if (inMainMatch || inNextMatch) {
      hasHeightened = true;
      heightenedEffect = (inMainMatch?.[1] || inNextMatch?.[1] || '').trim();
    }

    const $fullDiv = $(`<div>${mainHtml}</div>`);
    let notes = '';
    const $font = $fullDiv.find('font[color="#808080"]');
    if ($font.length) notes = $font.text().trim();

    let descHtml = mainHtml;
    const tableHtmlMatch = descHtml.match(/<TABLE[\s\S]*?<\/TABLE>/i);
    let spellTable;
    if (tableHtmlMatch) {
      spellTable = htmlTableToWikidot(tableHtmlMatch[0]);
      descHtml = descHtml.replace(/<TABLE[\s\S]*?<\/TABLE>/gi, '');
    }
    descHtml = descHtml.replace(/<EM[^>]*>[\s\S]*?<\/EM>\s*(?:<BR\s*\/?>)?/i, '');
    descHtml = descHtml.replace(/<(STRONG|b)>施法时间：<\/\1>[^<]*<BR\s*\/?>/gi, '');
    descHtml = descHtml.replace(/<(STRONG|b)>施法距离：<\/\1>[^<]*<BR\s*\/?>/gi, '');
    descHtml = descHtml.replace(/<(STRONG|b)>法术成分：<\/\1>[^<]*<BR\s*\/?>/gi, '');
    descHtml = descHtml.replace(/<(STRONG|b)>持续时间：<\/\1>[^<]*<BR\s*\/?>/gi, '');
    descHtml = descHtml.replace(/<(STRONG|b)>升环施法。<\/\1>[\s\S]*?(?=<BR\s*\/?><\/P>|<\/P>|$)/i, '');
    descHtml = descHtml.replace(/<FONT[^>]*>[\s\S]*?<\/FONT>/gi, '');
    descHtml = descHtml.replace(/<BLOCKQUOTE[^>]*>[\s\S]*?<\/BLOCKQUOTE>/gi, '');
    descHtml = descHtml.replace(/\n/g, ' ');
    descHtml = descHtml.replace(/<BR\s*\/?>/gi, '\n\n');
    descHtml = descHtml.replace(/^(?:\n\n)*/, '').replace(/(?:\n\n)*$/, '');
    let description = $(`<div>${descHtml}</div>`).text().trim();
    description = description.replace(/^(?:戏法|一环|二环|三环|四环|五环|六环|七环|八环|九环)[^（（]*（[^））]*）\s*\n*/, '');
    const formattedDesc = CN_EN_SPACER(description).replace(/  +/g, ' ');

    spells.push({
      id, name, level,
      school: schoolName + '系',
      castingTime: FIELD_SPACER(cleanText(castingTime)),
      range: FIELD_SPACER(cleanText(rng)),
      materialInfo: materialInfo ? CN_EN_SPACER(cleanText(materialInfo)) : undefined,
      duration: FIELD_SPACER(cleanText(duration)),
      components,
      description: formattedDesc,
      table: spellTable,
      classes: mappedClasses,
      notes: notes ? cleanText(notes) : undefined,
      hasHeightened: hasHeightened || undefined,
      heightenedEffect: heightenedEffect ? cleanText(heightenedEffect) : undefined,
      ritual: isRitual || undefined,
      concentration: isConcentration || undefined,
      source: '玩家手册 2014',
    });
  });

  return spells;
}

mkdirSync(OUT, { recursive: true });
const files = readdirSync(DIR).filter((f) => f.endsWith('.html'));
let total = 0;
for (const f of files) {
  const html = dec.decode(readFileSync(join(DIR, f)));
  const spells = parseRingHtml(html);
  const ringName = f.replace('.html', '');
  writeFileSync(join(OUT, `${ringName}.json`), JSON.stringify(spells, null, 2));
  const withTable = spells.filter((s) => s.table).length;
  total += spells.length;
  console.log(`${ringName}: ${spells.length} 条（含表格 ${withTable}）→ spells-import/${ringName}.json`);
}
console.log(`\n合计 ${total} 条。到 数据管理 → 法术导入 → 从 JSON 直接导入 逐环粘贴导入。`);
