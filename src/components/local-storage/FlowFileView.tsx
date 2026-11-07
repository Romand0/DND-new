import { useEffect, useMemo, useState } from 'react';
import { ListTree, Network } from 'lucide-react';
import type { FlowDefinition } from '@/types/flow';
import FlowGraphView from '@/components/flow-editor/presentation/canvas/FlowGraphView';
import FlowStructureOutline from '@/components/flow-editor/presentation/FlowStructureOutline';

const muted = 'dark:text-text-dark-muted light:text-text-light-muted';
const text = 'dark:text-text-dark light:text-text-light';

/**
 * 流程文件的专属打开格式：直接复用只读流程视图（结构图 / 结构大纲），
 * 与 /flow-editor/:id/view 展示一致，只是数据源来自 LocalStorage 快照。
 */
export default function FlowFileView({ value }: { value: any }) {
  const flows = useMemo<FlowDefinition[]>(() => {
    if (!Array.isArray(value)) return [];
    return value.filter((f): f is FlowDefinition => !!f && typeof f === 'object' && !!f.id);
  }, [value]);

  const [selectedId, setSelectedId] = useState<string | null>(flows[0]?.id ?? null);
  const [tab, setTab] = useState<'graph' | 'outline'>('outline');

  useEffect(() => {
    if (flows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !flows.some(f => f.id === selectedId)) {
      setSelectedId(flows[0].id);
    }
  }, [flows, selectedId]);

  const selected = flows.find(f => f.id === selectedId) ?? null;

  if (flows.length === 0) {
    return <div className={`text-sm ${muted}`}>该键中未找到流程定义（需要包含 id 的对象数组）。</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId ?? ''}
          onChange={e => setSelectedId(e.target.value)}
          className={`px-2 py-1 rounded-lg border bg-transparent text-sm outline-none max-w-xs ${text} dark:border-border-dark light:border-border-light`}
        >
          {flows.map(f => (
            <option key={f.id} value={f.id}>
              {f.name ?? f.id}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded border overflow-hidden dark:border-border-dark light:border-border-light">
          {([
            { id: 'outline', label: '结构大纲', icon: ListTree },
            { id: 'graph', label: '结构图', icon: Network },
          ] as const).map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
                  tab === item.id ? 'bg-primary text-white' : `${text} hover:bg-black/5 dark:hover:bg-white/10`
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="rounded-lg border p-3 dark:border-border-dark light:border-border-light">
          <div className={`mb-2 text-xs ${muted}`}>
            {selected.name ?? selected.id} · {selected.nodes?.length ?? 0} 节点 · {selected.edges?.length ?? 0} 连线
          </div>
          {tab === 'graph' ? (
            <FlowGraphView flow={selected} />
          ) : (
            <FlowStructureOutline flow={selected} />
          )}
        </div>
      )}
    </div>
  );
}
