// functions/api/import/equipments.ts

import * as cheerio from 'cheerio';

const CATEGORY_MAP: Record<string, string> = {
  weapons: '武器',
  armor: '护甲与盾牌',
  tools: '工具',
  adventuring: '冒险用品',
};

function parsePrice(raw: string): { amount: number; unit: 'gp' | 'sp' | 'cp' } {
  const match = raw.trim().match(/^([\d.]+)\s*(gp|sp|cp)$/i);
  if (!match) return { amount: 0, unit: 'gp' };
  return {
    amount: parseFloat(match[1]) || 0,
    unit: match[2].toLowerCase() as 'gp' | 'sp' | 'cp',
  };
}

function parseWeight(raw: string): number {
  const trimmed = raw.trim().replace(/[^\d./]/g, '');
  if (!trimmed) return 0;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      return den ? num / den : 0;
    }
  }
  return parseFloat(trimmed) || 0;
}

function parseDamage(raw: string): { dice: string; type: string } {
  const trimmed = raw.trim();
  const spacedMatch = trimmed.match(/^([\dw+\-]+)\s+(.+)$/);
  if (spacedMatch) {
    return { dice: spacedMatch[1], type: spacedMatch[2].trim() };
  }
  const chineseMatch = trimmed.match(/^([\da-zA-Z+\-]+)([\u4e00-\u9fff]+.*)$/);
  if (chineseMatch) {
    return { dice: chineseMatch[1], type: chineseMatch[2].trim() };
  }
  return { dice: trimmed, type: '' };
}

function isHeaderRow(cells: cheerio.Cheerio): boolean {
  const firstText = cells.first().text().trim();
  const headerKeywords = ['名称', '价格', '重量', '伤害', '属性', '物品'];
  return headerKeywords.some(kw => firstText.includes(kw));
}

/** 从混合名称（如"短棒Club"）中提取中文名和英文ID */
function splitName(raw: string): { chineseName: string; englishId: string } {
  const trimmed = raw.trim();
  // 提取开头的连续中文
  const cnMatch = trimmed.match(/^([\u4e00-\u9fff]+)/);
  const chineseName = cnMatch ? cnMatch[1] : trimmed;
  // 剩余部分作为英文
  let englishPart = cnMatch ? trimmed.slice(cnMatch[0].length) : '';
  // 清理英文部分：只保留字母、数字、空格、连字符，然后转小写、空格变连字符
  let englishId = englishPart
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  // 如果英文名为空，暂时置空（后续可由调用者生成）
  return { chineseName, englishId };
}

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const url = new URL(context.request.url);
  const category = url.searchParams.get('category');

  if (!category || !CATEGORY_MAP[category]) {
    return new Response(JSON.stringify({
      error: `不支持的品类: ${category}。支持的品类: ${Object.keys(CATEGORY_MAP).join(', ')}`
    }, null, 2), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const fileName = CATEGORY_MAP[category];
  const fileUrl = `https://raw.githubusercontent.com/DND5eChm/DND5e_chm/master/玩家手册/装备/${encodeURIComponent(fileName)}.html`;

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return new Response(`GitHub 文件抓取失败: ${response.status}`, { status: 500 });
    }

    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const html = decoder.decode(buffer);

    const $ = cheerio.load(html);
    const items: Array<{
  id: string;
  name: string;
  price: { amount: number; unit: 'gp' | 'sp' | 'cp' };
  weight: number;
  damageDice: string;
  damageType: string;
  acBase?: string;           // 护甲 AC，如 "11+DEX"、"14(MAX2)"、"16"、"+2"
  strengthReq?: number;      // 力量需求，如 13/15，无则为 0
  stealthDisadvantage?: boolean; // 隐匿劣势
  description: string;
  properties: string[];
  source: string;
  dataResource: string;
  category: string;
}> = [];


const isWeapon = category === 'weapons';
const isArmor = category === 'armor';

$('table tr').each((_, row) => {
  const cells = $(row).find('td');
  const minCols = isWeapon ? 5 : isArmor ? 6 : 3;

  if (cells.length < minCols) return;

  const rawName = $(cells[0]).text().trim();
  if (!rawName || isHeaderRow(cells)) return;

  const { chineseName, englishId } = splitName(rawName);

  const priceStr = $(cells[1]).text().trim();
  const price = parsePrice(priceStr);

  if (isWeapon) {
    // 武器：名称 | 价格 | 伤害 | 重量 | 属性（5列）
    const damageStr = $(cells[2]).text().trim();
    const weightStr = $(cells[3]).text().trim();
    const propsStr = $(cells[4]).text().trim();

    const { dice, type } = parseDamage(damageStr);
    const weight = parseWeight(weightStr);
    const properties = propsStr ? propsStr.split(/[,，]\s*/).map(s => s.trim()).filter(Boolean) : [];

    items.push({
      id: englishId,
      name: chineseName,
      price,
      weight,
      damageDice: dice,
      damageType: type,
      description: '',
      properties,
      source: '',
      dataResource: '5E不全书',
      category,
    });
  } else if (isArmor) {
    // 护甲：名称 | 价格 | AC | 力量 | 隐匿 | 重量（6列）
    const acStr = $(cells[2]).text().trim();
    const strStr = $(cells[3]).text().trim();
    const stealthStr = $(cells[4]).text().trim();
    const weightStr = $(cells[5]).text().trim();

    // 跳过具装（价格以 × 开头，是坐骑护甲倍数）
    if (priceStr.startsWith('×')) return;

    const weight = parseWeight(weightStr);
    // 过滤分类标题行（价格和重量都为0，如"轻甲/中甲/重甲/盾牌"——但这些是 colspan=6 单格，已被 minCols 过滤，这里主要是防其他异常）
    if (price.amount === 0 && weight === 0) return;

    // 解析力量需求："－" → 0，"力量13" → 13，"力量15" → 15
    let strengthReq = 0;
    const strMatch = strStr.match(/力量(\d+)/);
    if (strMatch) strengthReq = parseInt(strMatch[1]);

    // 解析隐匿劣势："－" → false，"劣势" → true
    const stealthDisadvantage = stealthStr.includes('劣势');

    items.push({
      id: englishId,
      name: chineseName,
      price,
      weight,
      damageDice: '',
      damageType: '',
      acBase: acStr,
      strengthReq,
      stealthDisadvantage,
      description: '',
      properties: [],
      source: '',
      dataResource: '5E不全书',
      category,
    });
  } else {
    // 非武器非护甲（工具/冒险用品）：名称 | 价格 | 重量（+ 可选描述）
    const weightStr = $(cells[2]).text().trim();
    const descStr = cells.length >= 4 ? $(cells[3]).text().trim() : '';

    const weight = parseWeight(weightStr);
    if (price.amount === 0 && weight === 0) return;

    items.push({
      id: englishId,
      name: chineseName,
      price,
      weight,
      damageDice: '',
      damageType: '',
      description: descStr,
      properties: [],
      source: '',
      dataResource: '5E不全书',
      category,
    });
  }
});

    return new Response(JSON.stringify({
      message: `成功解析 ${items.length} 条 ${fileName} 数据`,
      data: items
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(`处理出错: ${error.message}`, { status: 500 });
  }
};
