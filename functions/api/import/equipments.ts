// functions/api/import/equipments.ts

import cheerio from 'cheerio';

// 品类名 → 5E不全书文件名映射
const CATEGORY_MAP: Record<string, string> = {
  weapons: '武器',
  armor: '护甲与盾牌',
  tools: '工具',
  adventuring: '冒险用品',
};

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
    // 1. 抓取文件
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return new Response(`GitHub 文件抓取失败: ${response.status}`, { status: 500 });
    }

    // 2. GBK 解码
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const html = decoder.decode(buffer);

    // 3. 解析 HTML 表格
    const $ = cheerio.load(html);
    const items: Array<{
      name: string;
      price: string;
      weight: string;
      description: string;
      source: string;
      category: string;
    }> = [];

    // 遍历所有表格行
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const name = $(cells[0]).text().trim();
      // 跳过表头行
      if (!name || name.includes('物品') || name.includes('价格') || name.includes('重量')) return;

      const price = $(cells[1]).text().trim();
      const weight = $(cells[2]).text().trim();
      const description = cells[3] ? $(cells[3]).text().trim() : '';

      items.push({
        name,
        price,
        weight,
        description,
        source: '5E不全书',
        category,
      });
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
