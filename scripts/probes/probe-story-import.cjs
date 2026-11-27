// E2E probe: 剧情 P3 纯函数（导入解析/树操作）+ 工作台冒烟
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra)); }
}

const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));
  await ctx.route('**/api/story', async route => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ json: body.arc });
    }
    return route.fulfill({ json: [] });
  });

  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/story', { waitUntil: 'networkidle' });

  const pure = await page.evaluate(async () => {
    const imp = await import('/src/lib/storyImport.ts');
    const model = await import('/src/lib/storyModel.ts');

    const two = imp.parseStoryText('# 港口之夜\n海风\n---\n# 地窖\n阴暗');
    const noHeading = imp.parseStoryText('第一行正文\n第二行\n---\n只有一段');
    const custom = imp.parseStoryText('# A\na\n===\n# B\nb', '===');
    const empty = imp.parseStoryText('   \n  ');

    let arc = model.createStoryArc('camp', 'u1');
    const ch1 = model.createStoryChapter(0);
    arc = model.addChapter(arc, ch1);
    const sc = model.createStoryScene(ch1.id, 0);
    arc = model.addScene(arc, ch1.id, sc);
    const imported = model.applyImportedChapter(arc, '导入章', [{ title: '甲', text: '文本甲' }, { title: '乙', text: '' }]);
    const updated = model.updateScene(imported, imported.chapters[1].scenes[0].id, { title: '改' });
    const sorted = model.sortArc({
      ...imported,
      chapters: [...imported.chapters].reverse(),
    });
    const removed = model.removeScene(imported, imported.chapters[1].scenes[0].id);

    return {
      twoLen: two.length,
      twoTitles: two.map(s => s.title),
      twoText: two[1].text,
      noHeadingTitles: noHeading.map(s => s.title),
      noHeadingText: noHeading[1].text,
      customLen: custom.length,
      emptyLen: empty.length,
      arcDefaults: [arc.status, arc.chapters.length, arc.chapters[0].scenes.length],
      importedChapters: imported.chapters.length,
      importedScenes: imported.chapters[1].scenes.map(s => [s.title, s.snippets.length]),
      importedTitles: imported.chapters[1].scenes.map(s => s.title),
      updatedTitle: model.findScene(updated, updated.chapters[1].scenes[0].id)?.title,
      originalKept: model.findScene(imported, imported.chapters[1].scenes[0].id)?.title,
      foundChapter: model.findChapterOfScene(updated, updated.chapters[1].scenes[0].id)?.title,
      sortedFirst: sorted.chapters[0].title,
      removedLeft: removed.chapters[1].scenes.length,
      nextChapter: model.nextOrder([{ order: 0 }, { order: 2 }]),
      nextScene: model.nextSceneOrder([{ time: { order: 1 } }, { time: { order: 4 } }]),
    };
  }).catch(e => ({ error: e.message }));

  if (pure.error) {
    check('P3 纯函数模块可导入', false, pure);
  } else {
    check('1 按 --- 切两段', pure.twoLen === 2, pure.twoLen);
    check('2 # 标题提取', JSON.stringify(pure.twoTitles) === JSON.stringify(['港口之夜', '地窖']), pure.twoTitles);
    check('3 正文保留', pure.twoText === '阴暗', pure.twoText);
    check('4 无标题回退场景 N 且保留正文', pure.noHeadingTitles[0] === '场景 1' && pure.noHeadingText === '只有一段', pure.noHeadingTitles);
    check('5 自定义分隔符', pure.customLen === 2, pure.customLen);
    check('6 空文本返回空数组', pure.emptyLen === 0, pure.emptyLen);
    check('7 新建剧情线默认值', pure.arcDefaults[0] === 'planned' && pure.arcDefaults[1] === 1 && pure.arcDefaults[2] === 1, pure.arcDefaults);
    check('8 导入追加章节', pure.importedChapters === 2, pure.importedChapters);
    check('9 导入场景与片段', JSON.stringify(pure.importedScenes) === JSON.stringify([['甲', 1], ['乙', 0]]), pure.importedScenes);
    check('10 updateScene 不可变更新', pure.updatedTitle === '改' && pure.originalKept === '甲', [pure.updatedTitle, pure.originalKept]);
    check('11 场景反查章节', pure.foundChapter === '导入章', pure.foundChapter);
    check('12 sortArc 按章节 order', pure.sortedFirst === '第 1 章', pure.sortedFirst);
    check('13 removeScene 生效', pure.removedLeft === 1, pure.removedLeft);
    check('14 nextOrder / nextSceneOrder', pure.nextChapter === 3 && pure.nextScene === 5, [pure.nextChapter, pure.nextScene]);
  }

  const ui = await page.evaluate(() => ({
    heading: document.body.innerText.includes('剧情工作台'),
    createBtn: Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('新建剧情线')),
    emptyHint: document.body.innerText.includes('尚无剧情线'),
  }));
  check('15 工作台路由渲染', ui.heading === true, ui);
  check('16 新建入口与空态', ui.createBtn === true && ui.emptyHint === true, ui);

  const created = await page.evaluate(async () => {
    const { default: store } = await import('/src/data/storyStore.ts');
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('新建剧情线'));
    btn?.click();
    await new Promise(r => setTimeout(r, 300));
    return { count: store.getAll().length, title: store.getAll()[0]?.title };
  }).catch(e => ({ error: e.message }));
  check('17 新建剧情线写入 store', created.count === 1 && created.title === '未命名剧情线', created);

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
