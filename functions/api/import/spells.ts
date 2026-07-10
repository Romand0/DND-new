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

function parseComponents(compStr: string): { verbal: boolean; somatic: boolean; material: boolean } {
  const cleaned = compStr.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return {
    verbal: cleaned.includes('V'),
    somatic: cleaned.includes('S'),
    material: cleaned.includes('M'),
  };
}

function extractMaterialInfo(compStr: string): string {
  const m = compStr.match(/M[（(]([\s\S]+?)[)）]/);
  return m ? m[1].trim() : '';
}

function cleanText(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const url = new URL(context.request.url);
  const method = context.request.method;

  // POST：批量导入
  if (method === 'POST') {
    const body = await context.request.json() as { items: Array<Record<string, any>> };
    const db = context.env.DB;
    const stmts: D1PreparedStatement[] = [];

    if (!body.items || body.entities?.length === 0) {
      return new Response(JSON.stringify({ error: '导入列表为空', success: 0, fail: 0 }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    for (const item of (body.entities || body.items)) {
      try {
        const existing = await db.prepare(
          "SELECT id FROM spells WHERE json_extract(data, '$.id') = ?"
        ).bind(item.id).first();
        const data = JSON.stringify(item);
        if (existing) {
          stmts.push(db.prepare('UPDATE spells SET data = ? WHERE id = ?').bind(data, (existing as any).id));
        } else {
          stmts.push(db.prepare('INSERT INTO spells (id, data) VALUES (?, ?)').bind(item.id, data));
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: '查询阶段失败', detail: String(e) }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    try {
      await db.batch(stmts);
      const verify = await db.prepare('SELECT COUNT(*) as cnt FROM spells').first();
      return new Response(JSON.stringify({
        success: stmts.length, fail: 0,
        debug: { stmtsCount: stmts.length, totalAfter: (verify as any)?.cnt ?? null }
      }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: '写入阶段失败，已全部回滚', detail: String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // GET：预览
  const ring = url.searchParams.get('ring');
  if (!ring || !RING_FILES[ring]) {
    return new Response(JSON.stringify({
      error: `不支持的环数: ${ring}。支持的环数: ${Object.keys(RING_FILES).join(', ')}`
    }, null, 2), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const fileName = RING_FILES[ring];
  const BRANCH = 'main';
  const BASE_PATH = '玩家手册/魔法/法术详述';
  const fileUrl = `https://raw.githubusercontent.com/DND5eChm/DND5e_chm/${BRANCH}/${BASE_PATH}/${encodeURIComponent(fileName)}.html`;

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) return new Response(`GitHub 文件抓取失败: ${response.status}`, { status: 500 });

    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('gbk').decode(buffer);
    const $ = cheerio.load(html, { decodeEntities: false });

    const spells: Array<{
      id: string; name: string; level: number; school: string;
      castingTime: string; range: string;
      components: { verbal: boolean; somatic: boolean; material: boolean };
      materialInfo?: string;
      duration: string; description: string;
      classes: string[]; notes?: string;
      hasHeightened?: boolean; heightenedEffect?: string;
      ritual?: boolean; concentration?: boolean; source: string;
    }> = [];

    $('h4').each((_, el) => {
      const $h4 = $(el);
      const rawId = $h4.attr('id') || '';
      const id = rawId.toLowerCase().replace(/_/g, '-');

      const fullText = $h4.text().trim();
      const nameParts = fullText.split('｜');
      const name = nameParts.length > 1 ? nameParts[0].trim() : fullText;

      // 收 h4 之后到下一个 h4 之前的所有兄弟（P、UL 等），戏法里 P→UL→P 结构能全覆盖
      const $blockNodes = $h4.nextUntil('h4');
      if (!$blockNodes.length) return;
      const mainHtml = $blockNodes.map((_, n) => $.html(n)).get().join('');
      const $mainP = $blockNodes.filter('p').first();
      if (!$mainP.length) return;
      const mainText = $mainP.text().trim();

      // EM 行：兼容两种顺序
      //   1-9环："一环 防护（仪式；游侠、法师、奇械师）" → 环数在前
      //   戏法：  "咒法 戏法（术士、法师、奇械师）"   → 学派在前
      const emText = $mainP.find('em').text().trim();
      const emTokens = emText.split(/\s+/);
      let levelToken = '', schoolToken = '';
      for (const t of emTokens) {
        if (LEVEL_MAP[t] !== undefined) levelToken = t;
        else if (SCHOOL_MAP[t] !== undefined) schoolToken = t;
      }
      const level = levelToken ? LEVEL_MAP[levelToken] : -1;
      if (level === -1) return;
      let schoolName = schoolToken || '未知';
      schoolName = schoolName.replace('惑控', '附魔');

      const isRitual = emText.includes('仪式');

      // classes：魔契师→邪术师，删奇械师，仅剩奇械师则整项跳过
      const classesMatch = emText.match(/（(.+?)）/);
      const classesStr = classesMatch ? classesMatch[1] : '';
      const rawClasses = classesStr.replace(/仪式；/, '').split('、').filter(Boolean);
      const mappedClasses = rawClasses
        .map(c => c === '魔契师' ? '邪术师' : c)
        .filter(c => c !== '奇械师');
      if (mappedClasses.length === 0) return;

      // 4 字段：正则从 mainHtml 提取（已含全块：P+UL+P）
      let castingTime = '', rng = '', compStr = '', duration = '';
      const fieldRe = /<strong>(施法时间|施法距离|法术成分|持续时间)：<\/strong>([\s\S]*?)<br\s*\/?>/gi;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(mainHtml)) !== null) {
        const label = fm[1];
        const val = fm[2].replace(/<[^>]+>/g, '').trim();
        if (label === '施法时间') castingTime = val;
        else if (label === '施法距离') rng = val;
        else if (label === '法术成分') compStr = val;
        else if (label === '持续时间') duration = val;
      }

      const components = parseComponents(compStr);
      const materialInfo = extractMaterialInfo(compStr);
      const isConcentration = duration.includes('专注');

      // 升环段：主 P 内 + 后续 P 双位置（mainHtml 已含全块，nextP 兜底）
      let hasHeightened = false;
      let heightenedEffect = '';
      const heightReg = /升环施法。([\s\S]*?)(?:<\/?(?:p|font|ul)[^>]*>|$)/i;
      const inMainMatch = mainHtml.match(heightReg);
      const $nextP = $mainP.next('p');
      const nextHtml = $nextP.length ? ($nextP.html() || '') : '';
      const inNextMatch = nextHtml.match(heightReg);
      if (inMainMatch || inNextMatch) {
        hasHeightened = true;
        heightenedEffect = (inMainMatch?.[1] || inNextMatch?.[1] || '').trim();
        // 去掉前缀"升环施法。"（已在正则 capture 外，正文从 capture 1 取，这里已干净）
      }

      // notes：从全块找（Prestidigitation 的 FONT 在 UL>LI 里，不在第一个 P）
      const $fullDiv = $(`<div>${mainHtml}</div>`);
      let notes = '';
      const $font = $fullDiv.find('font[color="#808080"]');
      if ($font.length) notes = $font.text().trim();

      // description：从 mainHtml 剔已知块
      let descHtml = mainHtml;
      descHtml = descHtml.replace(/<em[^>]*>[\s\S]*?<\/em>\s*(?:<br\s*\/?>)?/i, '');
      descHtml = descHtml.replace(/<strong>施法时间：<\/strong>[^<]*<br\s*\/?>/gi, '');
      descHtml = descHtml.replace(/<strong>施法距离：<\/strong>[^<]*<br\s*\/?>/gi, '');
      descHtml = descHtml.replace(/<strong>法术成分：<\/strong>[^<]*<br\s*\/?>/gi, '');
      descHtml = descHtml.replace(/<strong>持续时间：<\/strong>[^<]*<br\s*\/?>/gi, '');
      descHtml = descHtml.replace(/<strong>升环施法。<\/strong>[\s\S]*?(?=<br\s*\/?><\/p>|<\/p>|$)/i, '');
      descHtml = descHtml.replace(/<font[^>]*>[\s\S]*?<\/font>/gi, '');
      // 清除文本节点中的无意义换行
      descHtml = descHtml.replace(/\n/g, ' ');
      // 将 <br> 替换为两个换行符（段落空行）
      descHtml = descHtml.replace(/<br\s*\/?>/gi, '\n\n');
      descHtml = descHtml.replace(/^(?:\n\n)*/, '').replace(/(?:\n\n)*$/, '');
      let description = $(`<div>${descHtml}</div>`).text().trim();
      // 兜底：纯文本形态残留的 EM 行
      description = description.replace(/^(?:戏法|一环|二环|三环|四环|五环|六环|七环|八环|九环)\s*[^\n（]*（[^）]*）\s*\n*/, '');
      // 中英文之间加空格
      let formattedDesc = description.replace(/([\u4e00-\u9fff])([a-zA-Z])/g, '$1 $2');
      formattedDesc = formattedDesc.replace(/([a-zA-Z])([\u4e00-\u9fff])/g, '$1 $2');

      spells.push({
        id, name, level,
        school: schoolName + '系',
        castingTime: cleanText(castingTime),
        range: cleanText(rng),
        components,
        materialInfo: materialInfo || undefined,
        duration: cleanText(duration),
        description: formattedDesc,
        classes: mappedClasses,
        notes: notes ? cleanText(notes) : undefined,
        hasHeightened: hasHeightened || undefined,
        heightenedEffect: heightenedEffect ? cleanText(heightenedEffect) : undefined,
        ritual: isRitual || undefined,
        concentration: isConcentration || undefined,
        source: '玩家手册 2014',
      });
    });

    return new Response(JSON.stringify({
      message: `成功解析 ${spells.length} 条 ${fileName} 法术数据`,
      data: spells
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(`处理出错: ${error.message}`, { status: 500 });
  }
};
