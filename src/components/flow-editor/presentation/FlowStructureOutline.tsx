import React, { useMemo } from 'react';
import { ArrowRight, CornerDownRight } from 'lucide-react';
import type { FlowDefinition } from '@/types/flow';
import { NODE_TYPE_REGISTRY } from '@/types/flow';
import { buildFlowOutline } from '@/utils/flow-editor/flow-outline';

interface FlowStructureOutlineProps {
  flow: FlowDefinition;
}

/**
 * 流程结构大纲：按拓扑顺序把节点与衔接关系列成线性步骤，不涉及坐标。
 */
export default function FlowStructureOutline({ flow }: FlowStructureOutlineProps) {
  const steps = useMemo(() => buildFlowOutline(flow), [flow]);

  if (steps.length === 0) {
    return (
      <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
        该流程暂无节点
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const meta = NODE_TYPE_REGISTRY.find(m => m.type === step.node.type);
        return (
          <li key={step.node.id} className="relative pl-9">
            {/* 序号徽标 */}
            <span
              className="absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ backgroundColor: meta?.color || '#6b7280' }}
            >
              {index + 1}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm dark:text-text-dark light:text-text-light">
                {step.node.label}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] dark:bg-white/10 light:bg-gray-100 dark:text-text-dark-muted light:text-text-light-muted">
                {step.typeLabel}
              </span>
            </div>

            {step.transitions.length === 0 ? (
              <div className="mt-1 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                （终点，无后续衔接）
              </div>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {step.transitions.map(t => (
                  <li
                    key={t.edgeId}
                    className="flex items-center gap-1.5 text-xs dark:text-text-dark-muted light:text-text-light-muted"
                  >
                    <CornerDownRight className="w-3 h-3 flex-shrink-0 opacity-60" />
                    {!t.isDefault && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                        {t.label}
                      </span>
                    )}
                    <ArrowRight className="w-3 h-3 flex-shrink-0 opacity-60" />
                    <span className="dark:text-text-dark light:text-text-light">
                      {t.targetLabel}
                    </span>
                    {t.condition && (
                      <span className="text-[10px] opacity-70">（{t.condition}）</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
