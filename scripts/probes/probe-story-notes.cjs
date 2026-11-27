// E2E probe: 剧情笔记 P1（纯函数 + 本地 store 契约）
// 服务端权限需 wrangler pages dev 验证，不在本探针范围。
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra)); }
}

const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };
const FIXTURE = {
  id: 'arc-1', campaignId: 'campaign-default', title: '暗潮', summary: '',
  status: 'planned', createdBy: 'e2e', createdAt: 1, updatedAt: 100,
  chapters: [{
    id: 'ch-1', title: '第一章', summary: '', order: 1, createdAt: 1, updatedAt: 1,
    scenes: [{
      id: 'sc-1', chapterId: 'ch-1', title: '港口', status: 'planned',
      time: { order: 1 }, location: { name: '港口' },
      roster: { characterIds: ['c1'], npcIds: [], absentCharacterIds: [] },
      snippets: [], plannedObjectives: [], plannedReward: {}, dependsOn: [],
      createdAt: 1, updatedAt: 1,
    }],
  }],
};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));

  let conflict = false;
  await ctx.route('**/api/story*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: [FIXTURE] });
    if (req.method() === 'PUT') {
      if (conflict) return route.fulfill({ status: 409, json: { error: '剧情已被其他窗口修改，请刷新后重试' } });
      const body = JSON.parse(req.postData() || '{}');
      return route.fulfill({ json: { ...body.arc, updatedAt: body.arc.updatedAt } });
    }
    if (req.method() === 'DELETE') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 405, json: {} });
  });

  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

  const pure = await page.evaluate(async (fixture) => {
    const m = await import('/functions/api/story/_shared.ts');
    const arc = {
      id: 'a', title: '测试', status: 'bogus',
      chapters: [{
        id: 'ch', title: '章', order: 0,
        scenes: [
          { id: 's1', title: '场景一', status: 'skipped', time: { order: 0, gameMinute: 2000 }, roster: { characterIds: ['c1', 'c2'] }, plannedObjectives: [{ id: 'o', title: '目标', assigneeIds: ['c3', 'c1'], kind: 'side' }] },
          { id: 's2', title: '场景二', status: 'planned', time: { order: 1 }, dependsOn: ['s1'] },
        ],
      }],
    };
    const norm = m.normalizeArc(arc, 'camp', 'u1', 1000);
    const dupChapter = m.validateArc({ title: 't', chapters: [
      { title: 'a', order: 0, scenes: [] }, { title: 'b', order: 0, scenes: [] },
    ] });
    const dupScene = m.validateArc({ title: 't', chapters: [
      { title: 'a', order: 0, scenes: [
        { id: 'x', title: 'x', status: 'planned', time: { order: 2 } },
        { id: 'y', title: 'y', status: 'planned', time: { order: 2 } },
      ] },
    ] });
    const missingDep = m.validateArc({ title: 't', chapters: [
      { title: 'a', order: 0, scenes: [{ id: 'x', title: 'x', status: 'planned', time: { order: 0 }, dependsOn: ['nope'] }] },
    ] });
    const activeUnmet = m.validateArc({ title: 't', chapters: [
      { title: 'a', order: 0, scenes: [
        { id: 'x', title: 'x', status: 'planned', time: { order: 0 } },
        { id: 'y', title: 'y', status: 'active', time: { order: 1 }, dependsOn: ['x'] },
      ] },
    ] });
    const skippedNoReason = m.validateArc({ title: 't', chapters: [
      { title: 'a', order: 0, scenes: [{ id: 'x', title: 'x', status: 'skipped', time: { order: 0 } }] },
    ] });
    const skippedWithReason = m.validateArc({ title: 't', chapters: [
      { title: 'a', order: 0, scenes: [{ id: 'x', title: 'x', status: 'skipped', time: { order: 0 }, skipReason: '玩家跳过' }] },
    ] });
    const valid = m.validateArc({ title: 't', chapters: [
      { title: 'a', order: 0, scenes: [{ id: 'x', title: 'x', status: 'active', time: { order: 0 }, roster: { characterIds: ['c1'] } }] },
    ] });
    return {
      statusDefault: norm.status,
      minuteClamp: norm.chapters[0].scenes[0].time.gameMinute,
      sceneChapterId: norm.chapters[0].scenes[0].chapterId,
      objectiveKind: norm.chapters[0].scenes[0].plannedObjectives[0].kind,
      rewardShape: Array.isArray(norm.chapters[0].scenes[0].plannedReward.items),
      emptyTitle: m.validateArc({ title: '  ', chapters: [] }).ok,
      dupChapter: dupChapter.ok,
      dupScene: dupScene.ok,
      missingDep: missingDep.ok,
      activeUnmet: activeUnmet.ok,
      skippedNoReason: skippedNoReason.ok,
      skippedWithReason: skippedWithReason.ok,
      valid: valid.ok,
      sceneIds: m.collectSceneIds(norm),
      chars: m.collectCharacterIds(norm),
      playerProjection: m.projectArcsForViewer([fixture], false),
      dmProjection: m.projectArcsForViewer([fixture], true).length,
      sourceKind: [m.isLedgerSourceKind('treasure'), m.isLedgerSourceKind('battle')],
      handoutKind: [m.isHandoutKind('letter'), m.isHandoutKind('story')],
    };
  }, FIXTURE).catch(e => ({ error: e.message }));

  if (pure.error) {
    check('纯函数模块可导入', false, pure);
  } else {
    check('1 normalize 状态兜底为 planned', pure.statusDefault === 'planned', pure.statusDefault);
    check('2 normalize 钳制 gameMinute 到 1439', pure.minuteClamp === 1439, pure.minuteClamp);
    check('3 normalize 场景回填 chapterId', pure.sceneChapterId === 'ch', pure.sceneChapterId);
    check('4 normalize 目标 kind 兜底', pure.objectiveKind === 'side', pure.objectiveKind);
    check('5 normalize 奖励 items 数组', pure.rewardShape === true, pure.rewardShape);
    check('6 空标题校验失败', pure.emptyTitle === false, pure.emptyTitle);
    check('7 章节顺序重复校验失败', pure.dupChapter === false, pure.dupChapter);
    check('8 场景顺序重复校验失败', pure.dupScene === false, pure.dupScene);
    check('9 前置场景缺失校验失败', pure.missingDep === false, pure.missingDep);
    check('10 进行中但前置未完成校验失败', pure.activeUnmet === false, pure.activeUnmet);
    check('11 跳过未填原因校验失败', pure.skippedNoReason === false, pure.skippedNoReason);
    check('12 跳过填原因校验通过', pure.skippedWithReason === true, pure.skippedWithReason);
    check('13 合法剧情线校验通过', pure.valid === true, pure.valid);
    check('14 collectSceneIds 取到两场景', JSON.stringify(pure.sceneIds) === JSON.stringify(['s1', 's2']), pure.sceneIds);
    check('15 collectCharacterIds 合并去重', JSON.stringify(pure.chars) === JSON.stringify(['c1', 'c2', 'c3']), pure.chars);
    check('16 玩家投影为空数组', Array.isArray(pure.playerProjection) && pure.playerProjection.length === 0, pure.playerProjection);
    check('17 DM 投影原样返回', pure.dmProjection === 1, pure.dmProjection);
    check('18 账本源类别白名单', pure.sourceKind[0] === true && pure.sourceKind[1] === false, pure.sourceKind);
    check('19 道具类别白名单', pure.handoutKind[0] === true && pure.handoutKind[1] === false, pure.handoutKind);
  }

  const store = await page.evaluate(async () => {
    const mod = await import('/src/data/storyStore.ts');
    const store = mod.default;
    await store.pull(true);
    const pulled = store.getAll();
    const arc = store.get('arc-1');
    const saved = await store.saveArc({ ...arc, summary: '改过' });
    const afterSave = store.get('arc-1');
    const dirtyAfterSave = store.isDirty('arc-1');
    await store.removeArc('arc-1');
    return {
      pulledCount: pulled.length,
      pulledTitle: arc?.title,
      savedSummary: saved.summary,
      localSummary: afterSave?.summary,
      dirtyAfterSave,
      afterRemove: store.getAll().length,
      persisted: !!localStorage.getItem('dnd-default:dnd-story'),
    };
  }).catch(e => ({ error: e.message }));

  if (store.error) {
    check('store 模块可导入', false, store);
  } else {
    check('20 pull 拉到剧情线', store.pulledCount === 1 && store.pulledTitle === '暗潮', store);
    check('21 saveArc 返回服务端结果', store.savedSummary === '改过', store.savedSummary);
    check('22 saveArc 同步本地缓存', store.localSummary === '改过', store.localSummary);
    check('23 saveArc 成功后清除 dirty', store.dirtyAfterSave === false, store.dirtyAfterSave);
    check('24 removeArc 清除本地', store.afterRemove === 0, store.afterRemove);
    check('25 本地键持久化', store.persisted === true, store.persisted);
  }

  // 冲突路径：重新拉取后保存 409
  conflict = true;
  const conflictResult = await page.evaluate(async () => {
    const store = (await import('/src/data/storyStore.ts')).default;
    await store.pull(true);
    const arc = store.get('arc-1');
    if (!arc) return { error: 'fixture missing' };
    try {
      await store.saveArc({ ...arc, summary: '冲突' });
      return { threw: false };
    } catch (e) {
      return { threw: true, message: String(e.message || e), dirty: store.isDirty('arc-1'), localSummary: store.get('arc-1')?.summary };
    }
  }).catch(e => ({ error: e.message }));

  if (conflictResult.error) {
    check('冲突路径可执行', false, conflictResult);
  } else {
    check('26 409 抛出错误', conflictResult.threw === true, conflictResult);
    check('27 冲突后保留本地修改与 dirty', conflictResult.dirty === true && conflictResult.localSummary === '冲突', conflictResult);
  }

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
