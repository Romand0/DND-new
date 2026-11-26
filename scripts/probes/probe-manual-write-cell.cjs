// 探针：手动记录写回格解析（DM 点选历史格优先，未选中回退当前回合）
// 运行：QUIET=1 node scripts/probes/probe-manual-write-cell.cjs
const path = require('path');
const { createJiti } = require('jiti');

const QUIET = !!process.env.QUIET;
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => { mem.clear(); },
  };
}

const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '../../src') } });

async function main() {
  const {
    resolveRecordWriteCell,
    buildPlaybackUndoEntry,
    applyPlaybackUndo,
    applyLogUndo,
  } = await jiti.import('@/lib/combatWriteCell');
  const combatStore = (await jiti.import('@/data/combatStore')).default;

  const fallback = { round: 3, combatantId: 'current' };
  const historical = { round: 1, combatantId: 'actor' };

  const picked = resolveRecordWriteCell(historical, fallback, 5);
  check('点选历史格优先', picked === historical, picked);

  const noOverride = resolveRecordWriteCell(null, fallback, 5);
  check('未指定回退当前回合', noOverride === fallback, noOverride);

  const undefinedOverride = resolveRecordWriteCell(undefined, fallback, 5);
  check('undefined 回退当前回合', undefinedOverride === fallback, undefinedOverride);

  const pickerOnly = resolveRecordWriteCell({ round: -1, combatantId: 'actor' }, fallback, 5);
  check('round<0 视为未选回合回退', pickerOnly === fallback, pickerOnly);

  const outOfRange = resolveRecordWriteCell({ round: 9, combatantId: 'actor' }, fallback, 5);
  check('越界回退当前回合', outOfRange === fallback, outOfRange);

  const atLast = resolveRecordWriteCell({ round: 4, combatantId: 'actor' }, null, 5);
  check('最后一轮可用（无回退）', atLast && atLast.round === 4, atLast);

  const noFallback = resolveRecordWriteCell({ round: -1, combatantId: 'actor' }, null, 5);
  check('无回退时返回 null', noFallback === null, noFallback);

  // ---- 单条记录撤销 ----
  const baseRecord = combatStore.create('探针撤销', [
    { name: '记录者', isMonster: true, currentHp: 20, maxHp: 20 },
  ]);
  const rid = baseRecord.combatants[0].id;
  combatStore.update(baseRecord.id, {
    rounds: [{ [rid]: '旧记录' }, { [rid]: '第二回合' }],
    roundsDm: [{ [rid]: 'DM旧明细' }],
  });
  const before = combatStore.get(baseRecord.id);

  // 播放：写入后撤销应还原到写入前文本
  const playbackEntry = buildPlaybackUndoEntry(baseRecord.id, { round: 0, combatantId: rid }, before);
  check('撤销快照捕获旧格文本', playbackEntry.prevCell === '旧记录' && playbackEntry.prevDmCell === 'DM旧明细', playbackEntry);
  const afterWrite = { ...before, rounds: [{ [rid]: '新记录' }, before.rounds[1]], roundsDm: [{ [rid]: 'DM新明细' }] };
  const restored = applyPlaybackUndo(afterWrite, playbackEntry);
  check('播放撤销还原本格', restored.rounds[0][rid] === '旧记录', restored.rounds[0]);
  check('播放撤销还原 DM 明细', restored.roundsDm[0][rid] === 'DM旧明细', restored.roundsDm[0]);
  check('播放撤销不影响其他回合', restored.rounds[1][rid] === '第二回合', restored.rounds[1]);

  // 日志：写入后撤销应按 id 移除
  combatStore.addOperationLog(baseRecord.id, { combatantId: rid, kind: 'attack', text: '一条日志' });
  const withLog = combatStore.get(baseRecord.id);
  const logId = withLog.operationLog[withLog.operationLog.length - 1].id;
  const logsAfterUndo = applyLogUndo(withLog, logId);
  check('日志撤销移除对应条目', logsAfterUndo.length === withLog.operationLog.length - 1, logsAfterUndo.length);
  check('日志撤销不动其他条目', logsAfterUndo.every(l => l.id !== logId), logsAfterUndo);

  console.log(`=== 手动写回格探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(err => { console.error(err); process.exit(1); });
