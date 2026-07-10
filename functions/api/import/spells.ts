import * as cheerio from 'cheerio';

const LEVEL_MAP: Record<string, number> = {
  '戏法': 0, '一环': 1, '二环': 2, '三环': 3, '四环': 4,
  '五环': 5, '六环': 6, '七环': 7, '八环': 8, '九环': 9,
};

const SCHOOL_MAP: Record<string, string> = {
  '防护': 'abjuration', '塑能': 'evocation', '惑控': 'enchantment',
  '咒法': 'conjuration', '幻术': 'illusion', '死灵': 'necromancy',
  '变化': 'transmutation', '预言': 'divination',
};

const RING_FILES: Record<string, string> = {
  '0': '戏法', '1': '1环', '2': '2环', '3': '3环', '4': '4环',
  '5': '5环', '6': '6环', '7': '7环', '8': '8环', '9': '9环',
};

function cleanHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

function parseComponents(compStr: string): { verbal: boolean; somatic: boolean; material: boolean } {
  const cleaned = compStr.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return {
    verbal: cleaned.includes('V'),
    somatic: cleaned.includes('S'),
    material: cleaned.includes('M'),
  };
}

function extractMaterialInfo(compStr: string): string {
  const m = compStr.match(/M[（(](.+?)[)）]/);
  return m ? m[1].trim() : '';
}

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const url = new URL(context.request.url);
  const method = context.request.method;

  // POST：批量导入已确认的条目
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
        const existing = await db.prepare(
          "SELECT id FROM spells WHERE json_extract(data, '$.id') = ?"
        ).bind(item.id).first();

        const data = JSON.stringify(item);

        if (existing) {
          stmts.push(
            db.prepare('UPDATE spells SET data = ? WHERE id = ?')
              .bind(data, (existing as any).id)
          );
        } else {
          stmts.push(
            db.prepare('INSERT INTO spells (id, data) VALUES (?, ?)')
              .bind(item.id, data)
          );
        }
      } catch (e) {
        return new Response(JSON.stringify({
          error: '查询阶段失败，未写入任何数据',
          detail: String(e)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    try {
      await db.batch(stmts);
      const verify = await db.prepare('SELECT COUNT(*) as cnt FROM spells').first();
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

  // GET：预览
  const ring = url.searchParams.get('ring');
  if (!ring || !RING_FILES[ring]) {
    return new Response(JSON.stringify({
      error: `不支持的环数: ${ring}。支持的环数: ${Object.keys(RING_FILES).join(', ')}`
    }, null, 2), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const fileName = RING_FILES[ring];
  const BRANCH = 'main';
  const BASE_PATH = '玩家手册/魔法/法术详述';
  const fileUrl = `https://raw.githubusercontent.com/DND5eChm/DND5e_chm/${BRANCH}/${BASE_PATH}/${encodeURIComponent(fileName)}.html`;

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return new Response(`GitHub 文件抓取失败: ${response.status}`, { status: 500 });
    }

    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const html = decoder.decode(buffer);
    const $ = cheerio.load(html, { decodeEntities: false });

    const spells: Array<{
      id: string;
      name: string;
      level: number;
      school: string;
      castingTime: string;
      range: string;
      components: { verbal: boolean; somatic: boolean; material: boolean };
      materialInfo?: string;
      duration: string;
      description: string;
      classes: string[];
      notes?: string;
      hasHeightened?: boolean;
      heightenedEffect?: string;
      ritual?: boolean;
      concentration?: boolean;
      source: string;
    }> = [];

    $('h4').each((_, el) => {
      const $h4 = $(el);
      const id = $h4.attr('id') || '';
      const fullText = $h4.text().trim();
      const nameParts = fullText.split('｜');
      const name = nameParts.length > 1 ? nameParts[0].trim() : fullText;

      const $mainP = $h4.next('p');
      if (!$mainP.length) return;

      const mainHtml = $mainP.html() || '';
      const mainText = $mainP.text().trim();

      // EM 行解析
      const emText = $mainP.find('em').text().trim();
      const levelMatch = emText.match(/^(戏法|一环|二环|三环|四环|五环|六环|七环|八环|九环)/);
      const level = levelMatch ? LEVEL_MAP[levelMatch[1]] : -1;
      if (level === -1) return;

      const schoolCn = emText.replace(/^(戏法|一环|二环|三环|四环|五环|六环|七环|八环|九环)\s*/, '').match(/^([^（]+)/);
      const school = schoolCn ? (SCHOOL_MAP[schoolCn[1].trim()] || schoolCn[1].trim()) : '未知';

      const isRitual = emText.includes('仪式');

      const classesMatch = emText.match(/（(.+?)）/);
      const classesStr = classesMatch ? classesMatch[1] : '';
      const classes = classesStr.replace(/仪式；/, '').split('、').filter(Boolean);

      
      // 4 个 STRONG 字段：正则从 mainHtml 提取（避开 cheerio 大写标签 + nextSibling 解析差异）
let castingTime = '', rng = '', compStr = '', duration = '';
const fieldRe = /<STRONG>(施法时间|施法距离|法术成分|持续时间)：<\/STRONG>([\s\S]*?)(?:<BR>|$)/g;
let m: RegExpExecArray | null;
while ((m = fieldRe.exec(mainHtml)) !== null) {
  const label = m[1]; // "施法时间" / "施法距离" / "法术成分" / "持续时间"
  let value = m[2]
    .replace(/<[^>]+>/g, '') // 去掉值内部可能的子标签（如 M 的括号内容里无标签，安全）
    .trim();
  if (label === '施法时间') castingTime = value;
  else if (label === '施法距离') rng = value;
  else if (label === '法术成分') compStr = value;
  else if (label === '持续时间') duration = value;
}


      // 从 compStr 解析 components 和 materialInfo（只声明一次）
      const components = parseComponents(compStr);
      const materialInfo = extractMaterialInfo(compStr);
      const isConcentration = duration.includes('专注');

      // 升环段：主 P 内 + nextP 双位置
      let hasHeightened = false;
      let heightenedEffect = '';
      const heightReg = /升环施法。([\s\S]*?)(?:<\/?(?:P|FONT|UL)[^>]*>|$)/;
      const inMainMatch = mainHtml.match(heightReg);
      const $nextP = $mainP.next('p');
      const nextHtml = $nextP.length ? ($nextP.html() || '') : '';
      const inNextMatch = nextHtml.match(heightReg);

      if (inMainMatch || inNextMatch) {
        hasHeightened = true;
        const effectText = (inMainMatch?.[1] || inNextMatch?.[1] || '').trim();
        heightenedEffect = '升环施法。' + effectText;
      }

      // notes：灰色备注
      let notes = '';
      const $font = $mainP.find('font[color="#808080"]');
      if ($font.length) {
        notes = $font.text().trim();
      }

      // description：主 P 文本去掉升环段和 notes
      let description = mainText;
      if (heightenedEffect) {
        description = description.replace(/升环施法。[\s\S]*/, '').trim();
      }
      if (notes) {
        description = description.replace(notes, '').trim();
      }

      spells.push({
        id,
        name,
        level,
        school,
        castingTime,
        range: rng,
        components,
        materialInfo: materialInfo || undefined,
        duration,
        description,
        classes,
        notes: notes || undefined,
        hasHeightened: hasHeightened || undefined,
        heightenedEffect: heightenedEffect || undefined,
        ritual: isRitual || undefined,
        concentration: isConcentration || undefined,
        source: 'PHB',
      });
    });

    return new Response(JSON.stringify({
      message: `成功解析 ${spells.length} 条 ${fileName} 法术数据`,
      data: spells
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(`处理出错: ${error.message}`, { status: 500 });
  }
};
