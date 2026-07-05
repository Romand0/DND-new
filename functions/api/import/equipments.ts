// functions/api/import/equipments.ts

import * as cheerio from 'cheerio';

// 品类名 → 5E不全书文件名映射
const CATEGORY_MAP: Record<string, string> = {
  weapons: '武器',
  armor: '护甲与盾牌',
  tools: '工具',
  adventuring: '冒险用品',
};

// 辅助函数：解析价格字符串 "15 gp" → { amount: 15, unit: 'gp' }
function parsePrice(raw: string): { amount: number; unit: 'gp' | 'sp' | 'cp' } {
  const match = raw.trim().match(/^([\d.]+)\s*(gp|sp|cp)$/i);
  if (!match) return { amount: 0, unit: 'gp' };
  return {
    amount: parseFloat(match[1]) || 0,
    unit: match[2].toLowerCase() as 'gp' | 'sp' | 'cp',
  };
}

// 辅助函数：解析重量字符串 "3 磅" → 3， "1/2 磅" → 0.5
function parseWeight(raw: string): number {
  const trimmed = raw.trim().replace(/[^\d./]/g, '');
  if (!trimmed) return 0;
  // 处理分数
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

// 辅助函数：解析伤害字符串 "1d8 穿刺" → { dice: '1d8', type: '穿刺' }
function parseDamage(raw: string): { dice: string; type: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([\dw+\-]+)\s+(.+)$/);
  if (match) {
    return { dice: match[1], type: match[2].trim() };
  }
  return { dice: trimmed, type: '' };
}

// 辅助函数：判断是否为表头行
function isHeaderRow(cells: cheerio.Cheerio): boolean {
  const firstText = cells.first().text().trim();
  const headerKeywords = ['名称', '价格', '重量', '伤害', '属性', '物品'];
  return headerKeywords.some(kw => firstText.includes(kw));
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
      name: string;
      price: { amount: number; unit: 'gp' | 'sp' | 'cp' };
      weight: number;
      damageDice: string;
      damageType: string;
      description: string;
      properties: string[];
      source: string;
      category: string;
    }> = [];

    // 根据品类决定列数：武器5列，其他4列
    const isWeapon = category === 'weapons';

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      const colCount = isWeapon ? 5 : 4;

      if (cells.length < colCount) return;

      const name = $(cells[0]).text().trim();
      if (!name || isHeaderRow(cells)) return;

      const priceStr = $(cells[1]).text().trim();
      const price = parsePrice(priceStr);

      if (isWeapon) {
        // 武器：第3列伤害，第4列重量，第5列属性
        const damageStr = $(cells[2]).text().trim();
        const weightStr = $(cells[3]).text().trim();
        const propsStr = $(cells[4]).text().trim();

        const { dice, type } = parseDamage(damageStr);
        const weight = parseWeight(weightStr);
        const properties = propsStr ? propsStr.split(/[,，]\s*/).map(s => s.trim()).filter(Boolean) : [];

        items.push({
          name,
          price,
          weight,
          damageDice: dice,
          damageType: type,
          description: '',
          properties,
          source: '5E不全书',
          category,
        });
      } else {
        // 非武器：第3列重量，第4列描述
        const weightStr = $(cells[2]).text().trim();
        const descStr = cells[3] ? $(cells[3]).text().trim() : '';

        const weight = parseWeight(weightStr);

        items.push({
          name,
          price,
          weight,
          damageDice: '',
          damageType: '',
          description: descStr,
          properties: [],
          source: '5E不全书',
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
