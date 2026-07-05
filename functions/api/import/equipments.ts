// functions/api/import/equipments.ts

import { Env } from '../../worker-configuration.d';
import { parse } from 'cheerio';

// 品类名 → 5E不全书文件名映射
const CATEGORY_MAP: Record<string, string> = {
  weapons: '武器',
  armor: '护甲与盾牌',
  tools: '工具',
  adventuring: '冒险用品',
  // 后续可以继续添加：饰品、坐骑与载具、装备等
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const category = url.searchParams.get('category'); // 从 URL 参数获取品类，例如 ?category=weapons

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

    // 3. 解析 HTML（通用逻辑）
    const $ = parse(html);
    const items = [];

    $('.tar_tb tbody tr').each((_, element) => {
      const cols = $(element).find('td');
      if (cols.length >= 3) { // 大部分品类至少有 3 列：名称、价格、重量
        const name = $(cols[0]).text().trim();
        const price = $(cols[1]).text().trim();
        const weight = $(cols[2]).text().trim();
        const description = cols[3] ? $(cols[3]).text().trim() : ''; // 有些品类没有第4列描述

        if (name && !name.includes('表头')) {
          items.push({
            name,
            price,
            weight,
            description,
            source: '5E不全书',
            category: category // 标记品类来源
          });
        }
      }
    });

    return new Response(JSON.stringify({
      message: `成功解析 ${items.length} 条 ${fileName} 数据`,
      data: items
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(`处理出错: ${error.message}`, { status: 500 });
  }
};
