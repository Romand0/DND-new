// 剧情纯文本导入：按分隔行切块，首行 # 标题或第一行作标题。
// 纯函数，供 DM 工作台与探针复用。

export interface ImportedScene {
  title: string;
  text: string;
}

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param raw 粘贴的既有剧情文本
 * @param delimiter 分隔行文本（整行匹配），默认 ---
 */
export function parseStoryText(raw: string, delimiter = '---'): ImportedScene[] {
  const text = String(raw ?? '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return [];
  const sep = new RegExp(`^[ \\t]*${escapeRegExp(delimiter)}[ \\t]*$`, 'm');
  const blocks = text.split(sep);
  const scenes: ImportedScene[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) continue;
    let title = '';
    let bodyLines = lines;
    const heading = lines[0].match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      title = heading[1].trim();
      bodyLines = lines.slice(1);
    }
    const body = bodyLines.join('\n').trim();
    const index = scenes.length + 1;
    scenes.push({ title: title || `场景 ${index}`, text: body });
  }
  return scenes;
}
