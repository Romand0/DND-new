// functions/api/import/equipments.ts

import * as cheerio from 'cheerio';

const CATEGORY_MAP: Record<string, string> = {
  weapons: '武器',
  armor: '护甲与盾牌',
  tools: '工具',
  adventuring: '冒险用品',
};

function parsePrice(raw: string): { amount: number; unit: 'gp' | 'sp' | 'cp' } {
  raw = raw.replace(/,/g, '');
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
  const chineseMatch = trimmed.match(/^([\da-zA-Z+\-]+)([一-鿿]+.*)$/);
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
  const cnMatch = trimmed.match(/^([一-鿿]+)/);
  const chineseName = cnMatch ? cnMatch[1] : trimmed;
  let englishPart = cnMatch ? trimmed.slice(cnMatch[0].length) : '';
  let englishId = englishPart
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return { chineseName, englishId };
}

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const url = new URL(context.request.url);
  const method = context.request.method;

  // POST：批量导入已确认的条目（原子写入 D1，失败自动回滚）
  if (method === 'POST') {
    const body = await context.request.json() as { items: Array<Record<string, any>> };
    const db = context.env.DB;

    const stmts: D1PreparedStatement[] = [];
    if (!body.items || body.items.length === 0) {
  return new Response(JSON.stringify({ error: '导入列表为空', success: 0, fail: 0 }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

    for (const item of body.items) {
      try {
        // 按 name 查找是否已存在（中文名唯一）
        const existing = await db.prepare(
          "SELECT id FROM equipments WHERE json_extract(data, '$.name') = ?"
        ).bind(item.name).first();

        const data = JSON.stringify(item);

        if (existing) {
          // 存在 → 覆盖原 id 的数据
          stmts.push(
            db.prepare('UPDATE equipments SET data = ? WHERE id = ?')
              .bind(data, (existing as any).id)
          );
        } else {
          // 不存在 → 新建，用解析器给的 id
          stmts.push(
            db.prepare('INSERT INTO equipments (id, data) VALUES (?, ?)')
              .bind(item.id, data)
          );
        }
      } catch (e) {
        // SELECT 阶段失败，整批放弃
        return new Response(JSON.stringify({
          error: '查询阶段失败，未写入任何数据',
          detail: String(e)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 原子写入：全部成功或全部回滚
    try {
      await db.batch(stmts);
      // 写入后验证：查 D1 当前总条数
      const verify = await db.prepare('SELECT COUNT(*) as cnt FROM equipments').first();
      return new Response(JSON.stringify({
        success: stmts.length,
        fail: 0,
        debug: {
          stmtsCount: stmts.length,
          totalAfter: (verify as any)?.cnt ?? null,
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({
        error: '写入阶段失败，已全部回滚',
        detail: String(e)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // GET：原有预览逻辑
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
      subtype?: string;
      damageDice: string;
      damageType: string;
      acBase?: string;
      strengthReq?: number;
      stealthDisadvantage?: boolean;
      description: string;
      properties: string[];
      source: string;
      dataResource: string;
      category: string;
    }> = [];

    const isWeapon = category === 'weapons';
    const isArmor = category === 'armor';
    let currentGroup = '';
    let currentSubtype = '';

    // 护甲 descMap 构建
    let descMap = new Map<string, string>();
    if (isArmor) {
      const $table = $('table').first();
      $table.prevAll('p').each((_, el) => {
        const html = $(el).html() || '';
        const segRe = /<b><i>[^<]*?<span>([一-鿿]+?)<\/span>[^<]*?<\/i><\/b><b><i>[^<]*?<span>[^<]+?<\/span>[^<]*?<\/i>\s*。([^<]+)/g;
        let m;
        while ((m = segRe.exec(html)) !== null) {
          const cnName = m[1].trim();
          const desc = m[2].trim();
          if (cnName && desc) {
            descMap.set(cnName, desc);
          }
        }
      });
    }

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      const minCols = isWeapon ? 5 : isArmor ? 6 : 3;

      if (cells.length < minCols) {
        if (isArmor && cells.length === 1) {
          const groupText = $(cells[0]).text().trim();
          if (groupText.includes('轻甲')) currentGroup = '轻甲';
          else if (groupText.includes('中甲')) currentGroup = '中甲';
          else if (groupText.includes('重甲')) currentGroup = '重甲';
          else if (groupText.includes('盾牌')) currentGroup = '盾牌';
        }
        if (isWeapon && cells.length === 1) {
          const groupText = $(cells[0]).text().trim();
          const cnPart = groupText.match(/^([一-鿿]+)/)?.[1] || '';
          currentSubtype = cnPart.replace(/武器$/, '');
        }
        return;
      }

      const rawName = $(cells[0]).text().trim();
      if (!rawName || isHeaderRow(cells)) return;

      const { chineseName, englishId } = splitName(rawName);

      const priceStr = $(cells[1]).text().trim();
      const price = parsePrice(priceStr);

      if (isWeapon) {
        const damageStr = $(cells[2]).text().trim();
        const weightStr = $(cells[3]).text().trim();
        const propsStr = $(cells[4]).text().trim();

        const { dice, type } = parseDamage(damageStr);
        const weight = parseWeight(weightStr);
        const properties = propsStr
  ? propsStr.split(/[,，]\s*/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s !== '－' && s !== '—')
  : [];

        items.push({
          id: englishId,
          name: chineseName,
          price,
          weight,
          subtype: currentSubtype,
          damageDice: dice,
          damageType: type,
          description: '',
          properties,
          source: '',
          dataResource: '5E不全书',
          category,
        });
      } else if (isArmor) {
        const acStr = $(cells[2]).text().trim();
        const strStr = $(cells[3]).text().trim();
        const stealthStr = $(cells[4]).text().trim();
        const weightStr = $(cells[5]).text().trim();

        if (priceStr.startsWith('×')) return;

        const weight = parseWeight(weightStr);
        if (price.amount === 0 && weight === 0) return;

        const cleanedAc = acStr.replace(/[＋]/g, '+');
        const acMatch = cleanedAc.match(/^(\+?\d+)/);
        const acBase = acMatch ? acMatch[1] : acStr;

        let strengthReq = 0;
        const strMatch = strStr.match(/力量(\d+)/);
        if (strMatch) strengthReq = parseInt(strMatch[1]);

        const stealthDisadvantage = stealthStr.includes('劣势');

        const armorProperties: string[] = [];
        if (stealthDisadvantage) {
          armorProperties.push('隐匿劣势');
        }

        items.push({
          id: englishId,
          name: chineseName,
          price,
          weight,
          damageDice: '',
          damageType: '',
          acBase,
          strengthReq,
          stealthDisadvantage,
          description: descMap.get(chineseName) || '',
          subtype: currentGroup || '',
          properties: armorProperties,
          source: '',
          dataResource: '5E不全书',
          category,
        });
      } else {
        const weightStr = $(cells[2]).text().trim();
        const descStr = cells.length >= 4 ? $(cells[3]).text().trim() : '';

        const weight = parseWeight(weightStr);
        if (price.amount === 0 && weight === 0) return;

        items.push({
          id: englishId,
          name: chineseName,
          price,
          weight,
          subtype: currentSubtype,
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
