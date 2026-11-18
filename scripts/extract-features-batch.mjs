// 特性 spec 批量提取脚本（feature-fullcycle P2，主路径）。
// 跑全部种子角色选项 traits → 逐条分类报告 → 白名单内高置信草案写入 phb2014.json（--write，diff review 后提交）。
// 用法：
//   node scripts/extract-features-batch.mjs            # dry：只输出报告，不写文件
//   node scripts/extract-features-batch.mjs --write    # 写入 spec 文件（仅新增键，已存在键跳过）
//   node scripts/extract-features-batch.mjs --json     # 额外输出机器可读报告
// 分类口径：
//   produce  = 白名单渠道（heal/resource_conv）+ confidence>=0.6 + 未 manual + 键不存在 → 写入
//   skip     = REGISTRY 已注册 / spec 键已存在
//   suggest  = 白名单外候选渠道（P3/P4 素材清单）
//   manual   = 低置信或结构不可表达（报告原因，不产出）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFeature, REGISTRY_NAMES, SPEC_CHANNEL_SET } from '../src/data/featureExtractCore.mjs';
import { validateFull } from '../plugins/featureSpecSchema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(ROOT, 'src/data/featureSpecs/phb2014.json');
const SEED_DIR = path.join(ROOT, 'public/seed/玩家手册2014/角色选项/');
const SEED_FILES = ['种族.json', '职业.json', '背景.json'];
const WRITE = process.argv.includes('--write');
const JSON_OUT = process.argv.includes('--json');

function collectTraits() {
  const out = [];
  for (const file of SEED_FILES) {
    const p = path.join(SEED_DIR, file);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === 'object') {
        if (Array.isArray(node.traits)) {
          node.traits.forEach((t) => {
            if (t && typeof t.name === 'string') out.push({ name: t.name, text: t.text ?? '', file });
          });
        }
        Object.values(node).forEach(walk);
      }
    };
    walk(data);
  }
  return out;
}

function dedupe(list) {
  const seen = new Map();
  for (const t of list) {
    if (!seen.has(t.name)) seen.set(t.name, t);
    else if (t.text.length > seen.get(t.name).text.length) seen.set(t.name, t);
  }
  return [...seen.values()];
}

function runBatch() {
  const existing = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  const traits = dedupe(collectTraits());
  const report = [];
  let writes = 0;
  for (const t of traits) {
    const r = extractFeature(t.name, t.text);
    if (REGISTRY_NAMES.includes(t.name)) {
      report.push({ name: t.name, cls: 'skip', reason: 'REGISTRY 已注册（代码注册表优先，spec 文件不产出）', guess: r.guess?.channel ?? null });
      continue;
    }
    if (existing[t.name] != null) {
      report.push({ name: t.name, cls: 'skip', reason: 'spec 键已存在', guess: r.guess?.channel ?? null });
      continue;
    }
    const best = r.candidates.length > 0
      ? r.candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a))
      : null;
    if (best && !best.manual && best.confidence >= 0.6 && SPEC_CHANNEL_SET.has(best.channel)) {
      report.push({ name: t.name, cls: 'produce', channel: best.channel, confidence: best.confidence, spec: best.spec });
      if (WRITE) {
        existing[t.name] = { channel: best.channel, spec: best.spec, source: 'seed_batch', confidence: best.confidence };
        writes += 1;
      }
      continue;
    }
    if (best && best.manual) {
      report.push({ name: t.name, cls: 'manual', reason: best.manualReason ?? '低置信', confidence: best.confidence, guess: r.guess?.channel ?? null });
      continue;
    }
    report.push({
      name: t.name,
      cls: r.guess ? 'suggest' : 'unmatched',
      reason: r.guess ? r.guess.reason : '无触发词命中',
      guess: r.guess?.channel ?? null,
    });
  }
  return { report, writes, existing, traits: traits.length };
}

const { report, writes, existing, traits } = runBatch();

// 汇总
const byCls = {};
for (const r of report) byCls[r.cls] = (byCls[r.cls] ?? 0) + 1;
console.log(`种子特性 ${traits} 条（去重后）→ produce ${byCls.produce ?? 0} / skip ${byCls.skip ?? 0} / suggest ${byCls.suggest ?? 0} / manual ${byCls.manual ?? 0} / unmatched ${byCls.unmatched ?? 0}${WRITE ? `，已写入 ${writes} 条` : '（dry，未写文件）'}`);
for (const r of report) {
  if (r.cls === 'produce') console.log(`  [produce] ${r.name} → ${r.channel}（置信 ${r.confidence}）${JSON.stringify(r.spec)}`);
  else if (r.cls === 'manual') console.log(`  [manual ] ${r.name}（置信 ${r.confidence}）：${r.reason}`);
  else if (r.cls === 'suggest') console.log(`  [suggest] ${r.name}：${r.reason}`);
}

if (WRITE && writes > 0) {
  fs.writeFileSync(SPEC_PATH, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  const errs = validateFull(ROOT);
  console.log(`写入完成：${SPEC_PATH}；构建期校验 ${errs.length === 0 ? 'PASS' : `FAIL ${JSON.stringify(errs)}`}`);
}

if (JSON_OUT) {
  fs.writeFileSync(path.join(ROOT, '/tmp/opencode/extract-report.json'), JSON.stringify(report, null, 1), 'utf8');
}
