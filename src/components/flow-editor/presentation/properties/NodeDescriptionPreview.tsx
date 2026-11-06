import type { FlowNodeDef } from '@/types/flow';
import { describeNodeConfig } from '@/utils/flowDescribe';

interface NodeDescriptionPreviewProps {
  node: FlowNodeDef;
}

/**
 * 编辑态属性摘要：复用只读视图的自然语言翻译，让配置修改同步可见。
 */
export default function NodeDescriptionPreview({ node }: NodeDescriptionPreviewProps) {
  const descriptions = describeNodeConfig(node);
  if (descriptions.length === 0) return null;

  return (
    <div className="mb-3 p-2 rounded border dark:border-border-dark light:border-border-light dark:bg-white/5 light:bg-gray-50">
      <div className="text-[10px] font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
        属性摘要
      </div>
      <ul className="space-y-0.5">
        {descriptions.map((line, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-xs dark:text-text-dark-muted light:text-text-light-muted"
          >
            <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0 dark:bg-text-dark-muted light:bg-text-light-muted opacity-60" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
