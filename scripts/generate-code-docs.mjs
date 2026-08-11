#!/usr/bin/env node
/**
 * 逐个调用智谱（BigModel）OpenAI 兼容 Chat Completions API，
 * 为源码目录下每个代码文件生成一份 Markdown 文档。
 *
 * 幂等：`.code-docs-manifest.json` 记录每个源文件的内容哈希，
 * 哈希未变的文件直接跳过，不重复消耗 API。
 *
 * 环境变量：
 *   ZHIPU_API_KEY         必填，智谱 API Key
 *   ZHIPU_BASE_URL        默认 https://open.bigmodel.cn/api/paas/v4/
 *   ZHIPU_MODEL           默认 glm-4-flash（免费档）
 *   DOC_SOURCE_DIRS       逗号分隔的源码目录，默认 src
 *   DOC_FILE_EXTENSIONS   逗号分隔的文件扩展名，默认 ts,tsx,js,jsx
 *   DOC_OUT_DIR           输出目录，默认 docs/generated
 *   DOC_LANGUAGE          文档语言，默认 中文
 *   DOC_DELAY_MS          两次请求间隔，默认 1500ms（规避限流）
 *   DOC_MAX_INPUT_BYTES   超过该字节数的源文件跳过，默认 300000
 */
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const apiKey = process.env.ZHIPU_API_KEY;
const baseURL = (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/").replace(/\/+$/u, "");
const model = process.env.ZHIPU_MODEL || "glm-4-flash";
const sourceDirs = (process.env.DOC_SOURCE_DIRS || "src")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const extensions = new Set(
  (process.env.DOC_FILE_EXTENSIONS || "ts,tsx,js,jsx")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const language = process.env.DOC_LANGUAGE || "中文";
const delayMs = Number(process.env.DOC_DELAY_MS || 1500);
const maxInputBytes = Number(process.env.DOC_MAX_INPUT_BYTES || 300_000);
const maxTokens = Number(process.env.DOC_MAX_TOKENS || 4096);
const outDir = path.resolve(repoRoot, process.env.DOC_OUT_DIR || "docs/generated");
const manifestPath = path.join(outDir, ".code-docs-manifest.json");

const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".git", ".cache", "coverage"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listFiles(dir, rel) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      out.push(...(await listFiles(abs, relPath)));
    } else if (entry.isFile()) {
      out.push(relPath);
    }
  }
  return out;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function loadManifest() {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    return { files: parsed && typeof parsed.files === "object" ? parsed.files : {} };
  } catch {
    return { files: {} };
  }
}

async function saveManifest(manifest) {
  await mkdir(outDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function buildPrompt(relPath, content) {
  return `你是资深软件技术文档工程师，正在为一个开源项目撰写代码文档。

请为下面给出的源文件编写一份 Markdown 技术文档，使用 ${language} 撰写。

文档结构（按顺序）：
1. 标题：H1，写文件路径
2. 功能概述：该文件做什么、承担什么职责、为什么存在
3. 主要导出/接口：导出的类型、函数、组件、Store、常量及其签名或结构
4. 核心实现说明：关键逻辑、状态管理、与项目其他模块的关系、被谁引用
5. 注意事项或使用方式：可推断的调用方式、使用前提

要求：
- 严格依据文件内容与项目上下文，不得臆造文件里不存在的 API 或行为
- 代码、符号、类型名用反引号或代码块形式呈现
- 只输出 Markdown 文档正文本身，不要用 \`\`\` 围栏包裹整篇文档，不要输出开场白或结尾寒暄

文件路径：${relPath}

文件内容：
\`\`\`text
${content}
\`\`\``;
}

async function chat(relPath, content) {
  const url = `${baseURL}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildPrompt(relPath, content) }],
      temperature: 0.3,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const output = data?.choices?.[0]?.message?.content;
  if (typeof output !== "string" || !output.trim()) {
    throw new Error("empty completion");
  }
  return output.trim();
}

async function callWithRetry(fn, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = /(429|5\d\d|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed)/u.test(String(error.message));
      if (!retryable || attempt === attempts) break;
      const backoff = Math.min(30_000, 5_000 * 2 ** (attempt - 1));
      process.stderr.write(`  重试 ${attempt}/${attempts - 1}，等待 ${backoff}ms：${error.message}\n`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

function cleanDoc(doc) {
  let text = doc.trim();
  const fence = text.match(/^```(?:markdown|md)?\s*\n/iu);
  if (fence) text = text.slice(fence[0].length);
  if (text.endsWith("```")) text = text.slice(0, -3);
  return text.trim();
}

async function main() {
  if (!apiKey) {
    console.error("错误：环境变量 ZHIPU_API_KEY 未设置");
    process.exit(1);
  }

  const files = (await Promise.all(sourceDirs.map((dir) => listFiles(path.resolve(repoRoot, dir), dir)))).flat();
  const targets = [];
  for (const rel of files) {
    const ext = rel.includes(".") ? rel.slice(rel.lastIndexOf(".") + 1) : "";
    if (!extensions.has(ext)) continue;
    const abs = path.join(repoRoot, rel);
    let info;
    try {
      info = await stat(abs);
    } catch {
      continue;
    }
    if (info.size > maxInputBytes) {
      console.log(`跳过（文件过大 ${info.size}B） ${rel}`);
      continue;
    }
    targets.push(rel);
  }
  targets.sort();

  if (targets.length === 0) {
    console.log("没有需要文档化的文件。");
    return;
  }
  console.log(`发现 ${targets.length} 个待文档化文件（目录：${sourceDirs.join(", ")}，扩展名：${[...extensions].join(",")}）`);

  const manifest = await loadManifest();
  let changed = 0;
  let skipped = 0;
  const failed = [];

  for (const rel of targets) {
    const abs = path.join(repoRoot, rel);
    const content = await readFile(abs, "utf8");
    const hash = sha256(content);
    if (manifest.files[rel]?.sha === hash) {
      skipped += 1;
      console.log(`跳过（内容未变化） ${rel}`);
      continue;
    }

    try {
      const doc = await callWithRetry(() => chat(rel, content));
      const outRel = rel.replace(/\.[^.]+$/u, ".md");
      const outAbs = path.join(outDir, outRel);
      await mkdir(path.dirname(outAbs), { recursive: true });
      await writeFile(outAbs, `${cleanDoc(doc)}\n`, "utf8");
      manifest.files[rel] = { sha: hash, at: new Date().toISOString() };
      changed += 1;
      console.log(`生成 ${rel} -> ${path.relative(repoRoot, outAbs)}`);
    } catch (error) {
      failed.push(`${rel}: ${error.message}`);
      console.error(`失败 ${rel}: ${error.message}`);
    }
    await sleep(delayMs);
  }

  await saveManifest(manifest);
  console.log(`完成：新生成/更新 ${changed} 个，跳过 ${skipped} 个${failed.length ? `，失败 ${failed.length} 个` : ""}`);
  if (failed.length > 0) {
    console.error(`失败清单（下次运行会自动重试）：\n${failed.join("\n")}`);
    // 部分成功时仍返回 0，让后续 create-pull-request 步骤把成功文档提交上去；
    // 全部失败说明凭证/网络有硬问题，才以非零退出让 job 标红。
    if (changed === 0) process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
