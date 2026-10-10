import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { FlowDefinition, FlowEdgeDef } from '@/types/flow';
import { layoutTopology } from '@/utils/flow-editor/topology-layout';
import { TRIGGER_LABELS } from '@/utils/flow-editor/flow-outline';
import {
  getSmartEdgePath,
  getSmartArrowPos,
  getSmartLabelPos,
} from '@/utils/flow-editor/edge-connection';
import { useNodeSizeMeasurement } from '@/components/flow-editor/hooks/use-node-size-measurement';
import FlowNodeCard from '@/components/flow-editor/presentation/nodes/FlowNodeCard';

interface FlowGraphViewProps {
  flow: FlowDefinition;
}

/**
 * 只读流程画布：按拓扑派生坐标渲染节点卡片与衔接连线。
 * 不含拖拽 / 连接 / 删除 / 选中 / 校验等编辑能力。
 */
export default function FlowGraphView({ flow }: FlowGraphViewProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const layout = useMemo(() => layoutTopology(flow), [flow]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [autoFit, setAutoFit] = useState(true);

  const { nodeSizes, setNodeRef } = useNodeSizeMeasurement({
    nodes: layout.nodes,
    canvasScale: scale,
  });

  const fitToContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const availW = el.clientWidth - 32;
    const availH = el.clientHeight - 32;
    if (availW <= 0 || availH <= 0) return;
    const s = Math.min(availW / layout.width, availH / layout.height, 1);
    setScale(Math.max(0.2, Math.round(s * 100) / 100));
  }, [layout.width, layout.height]);

  useEffect(() => {
    if (autoFit) fitToContainer();
  }, [autoFit, fitToContainer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (autoFit) fitToContainer();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit, fitToContainer]);

  const zoomBy = (delta: number) => {
    setAutoFit(false);
    setScale(s => Math.min(2, Math.max(0.2, Math.round((s + delta) * 100) / 100)));
  };

  const resetView = () => {
    setAutoFit(false);
    setScale(1);
  };

  const fitView = () => {
    setAutoFit(true);
    fitToContainer();
  };

  if (flow.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-16 text-center text-sm dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted">
        该流程暂无节点
      </div>
    );
  }

  const renderEdgeLabel = (edge: FlowEdgeDef): string => {
    if (edge.label) return edge.label;
    if (edge.trigger !== 'on_complete') return TRIGGER_LABELS[edge.trigger] || edge.trigger;
    return '';
  };

  return (
    <div className="relative">
      {/* 缩放控制 */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border px-1 py-0.5 dark:border-border-dark dark:bg-bg-dark-2 light:border-border-light light:bg-white shadow-sm">
        <button onClick={() => zoomBy(-0.1)} title="缩小"
          className="p-1.5 rounded dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/10">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs w-10 text-center tabular-nums dark:text-text-dark-muted light:text-text-light-muted">
          {Math.round(scale * 100)}%
        </span>
        <button onClick={() => zoomBy(0.1)} title="放大"
          className="p-1.5 rounded dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/10">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={resetView} title="重置为 100%"
          className="p-1.5 rounded dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/10">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button onClick={fitView} title="适应窗口"
          className="p-1.5 rounded dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/10">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="w-full h-[65vh] overflow-auto rounded-xl border dark:bg-bg-dark light:bg-gray-50 dark:border-border-dark light:border-border-light select-none"
      >
        <div style={{ width: layout.width * scale, height: layout.height * scale, position: 'relative' }}>
          <div
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            {/* 连线层 */}
            <svg
              width={layout.width}
              height={layout.height}
              className="absolute inset-0 pointer-events-none"
            >
              <defs>
                <marker id="view-chevron-dark" viewBox="0 0 10 10" refX="5" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#818cf8" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" />
                </marker>
                <marker id="view-chevron-light" viewBox="0 0 10 10" refX="5" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" />
                </marker>
                <marker id="view-chevron-fail-dark" viewBox="0 0 10 10" refX="5" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#f87171" strokeWidth="1.5"
                    strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
                <marker id="view-chevron-fail-light" viewBox="0 0 10 10" refX="5" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.5"
                    strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>

              {layout.edges.map(edge => {
                const path = getSmartEdgePath(edge, layout.nodes, nodeSizes);
                if (!path) return null;
                const isFailEdge = edge.trigger === 'on_failure' || edge.trigger === 'on_false';
                const label = renderEdgeLabel(edge);
                const markerId = isFailEdge
                  ? (isDark ? 'view-chevron-fail-dark' : 'view-chevron-fail-light')
                  : (isDark ? 'view-chevron-dark' : 'view-chevron-light');
                const labelPos = label ? getSmartLabelPos(edge, layout.nodes, nodeSizes) : null;
                return (
                  <g key={edge.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={isDark ? (isFailEdge ? '#7f1d1d' : '#4338ca') : (isFailEdge ? '#fecaca' : '#e5e7eb')}
                      strokeWidth={2}
                      strokeLinecap="round"
                      opacity={0.7}
                      markerEnd={`url(#${markerId})`}
                    />
                    <polygon
                      points="0,-5 10,0 0,5"
                      fill={isDark ? '#312e81' : '#ffffff'}
                      stroke={isDark ? '#818cf8' : '#9ca3af'}
                      strokeWidth="1"
                      transform={`translate(${getSmartArrowPos(edge, layout.nodes, nodeSizes)})`}
                    />
                    {label && labelPos && (
                      <>
                        <rect
                          x={parseInt(labelPos.split(',')[0], 10) - 30}
                          y={parseInt(labelPos.split(',')[1], 10) - 11}
                          width="60"
                          height="22"
                          rx="6"
                          fill={isDark ? '#4338ca' : '#ffffff'}
                          stroke={isDark ? '#818cf8' : '#d1d5db'}
                          strokeWidth="1"
                        />
                        <text
                          x={parseInt(labelPos.split(',')[0], 10)}
                          y={parseInt(labelPos.split(',')[1], 10)}
                          fill={isDark ? '#ffffff' : '#1a1a2e'}
                          fontSize="10"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontWeight="600"
                        >{label}</text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* 节点卡片层 */}
            {layout.nodes.map(node => (
              <FlowNodeCard
                key={node.id}
                node={node}
                x={node.position.x}
                y={node.position.y}
                nodeRef={(el) => setNodeRef(node.id, el)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
