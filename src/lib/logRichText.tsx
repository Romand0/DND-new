import type { ReactNode } from 'react';

/**
 * 战斗日志/先攻表格富文本渲染器。
 * 写入端用轻量标记包裹关键信息，渲染端解析为带色片段（标记符号本身不显示）：
 * - 《名称》 → 法术/武器/物品名（紫色），纯样式区分，无书名号
 * - 【数值】 → 数值裸显并加粗（琥珀），如 7、+6、30→12
 * - 关键字：击昏/杀死（红粗）、未命中/施法失败/失败（红）、豁免通过（绿）、无效（灰）
 */
const TOKEN_RE = /(《[^》]+》|【[^】]+】|击昏|杀死|未命中|施法失败|失败|豁免通过|无效)/g;

export function renderLogText(text: string): ReactNode {
  if (!text) return null;
  const parts = text.split(TOKEN_RE);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('《') && p.endsWith('》')) {
      return (
        <span key={i} className="font-medium text-violet-600 dark:text-violet-300">
          {p.slice(1, -1)}
        </span>
      );
    }
    if (p.startsWith('【') && p.endsWith('】')) {
      return (
        <span key={i} className="font-bold text-amber-600 dark:text-amber-300">
          {p.slice(1, -1)}
        </span>
      );
    }
    if (p === '击昏' || p === '杀死') {
      return (
        <span key={i} className="font-bold text-red-600 dark:text-red-400">
          {p}
        </span>
      );
    }
    if (p === '未命中' || p === '施法失败' || p === '失败') {
      return (
        <span key={i} className="text-red-500 dark:text-red-400">
          {p}
        </span>
      );
    }
    if (p === '豁免通过') {
      return (
        <span key={i} className="text-emerald-600 dark:text-emerald-400">
          {p}
        </span>
      );
    }
    if (p === '无效') {
      return (
        <span key={i} className="text-gray-500 dark:text-gray-400">
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}
