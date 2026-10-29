import { useMemo } from 'react';
import type { FlowDefinition, FlowEdgeDef } from '@/types/flow';
import { layoutTopology } from '@/utils/flow-editor/topology-layout';
import { canMoveWithinRank } from '@/utils/flow-editor/topology-edit';
import { TRIGGER_LABELS } from '@/utils/flow-editor/flow-outline';
import {
  getSmartEdgePath,
  getSmartArrowPos,
  getSmartLabelPos,
} from '@/utils/flow-editor/edge-connection';
import { useNodeSizeMeasurement } from '@/components/flow-editor/hooks/use-node-size-measurement';
import EditableFlowNodeCard from '@/components/flow-editor/presentation/nodes/EditableFlowNodeCard';

interface FlowTopologyEditorCanvasProps {
  flow: FlowDefinition;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectFromId: string | null;
  canvasScale: number;
  isDark: boolean;
  onNodeSelect: (nodeId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onCanvasClick: () => void;
  onInsertAfter: (nodeId: string) => void;
  onStartConnecting: (nodeId: string) => void;
  onMoveWithinRank: (nodeId: string, direction: -1 | 1) => void;
  onDeleteNode: (nodeId: string) => void;
}

/**
 * 拓扑编辑画布：节点坐标全部由 layoutTopology 派生，卡片承载结构操作。
 * 画布自身不做拖拽与坐标持久化。
 */
export default function FlowTopologyEditorCanvas({
  flow,
  selectedNodeId,
  selectedEdgeId,
  connectFromId,
  canvasScale,
  isDark,
  onNodeSelect,
  onEdgeSelect,
  onCanvasClick,
  onInsertAfter,
  onStartConnecting,
  onMoveWithinRank,
  onDeleteNode,
}: FlowTopologyEditorCanvasProps) {
  const layout = useMemo(() => layoutTopology(flow), [flow]);

  const { nodeSizes, setNodeRef } = useNodeSizeMeasurement({
    nodes: layout.nodes,
    canvasScale,
  });

  const edgeLabel = (edge: FlowEdgeDef): string => {
    if (edge.label) return edge.label;
    if (edge.trigger !== 'on_complete') return TRIGGER_LABELS[edge.trigger] || edge.trigger;
    return '';
  };

  return (
    <div
      className="relative"
      style={{ width: layout.width, height: layout.height }}
      onClick={onCanvasClick}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <svg
        width={layout.width}
        height={layout.height}
        className="absolute inset-0 pointer-events-none"
      >
        <defs>
          <marker id="edit-chevron-dark" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#818cf8" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <marker id="edit-chevron-light" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <marker id="edit-chevron-fail-dark" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#f87171" strokeWidth="1.5"
              strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <marker id="edit-chevron-fail-light" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.5"
              strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        {layout.edges.map(edge => {
          const path = getSmartEdgePath(edge, layout.nodes, nodeSizes);
          if (!path) return null;
          const isFailEdge = edge.trigger === 'on_failure' || edge.trigger === 'on_false';
          const isSelected = edge.id === selectedEdgeId;
          const isFromConnectSource = connectFromId === edge.from;
          const label = edgeLabel(edge);
          const labelPos = label ? getSmartLabelPos(edge, layout.nodes, nodeSizes) : null;
          const markerId = isFailEdge
            ? (isDark ? 'edit-chevron-fail-dark' : 'edit-chevron-fail-light')
            : (isDark ? 'edit-chevron-dark' : 'edit-chevron-light');
          const stroke = isSelected
            ? (isDark ? '#f87171' : '#6366f1')
            : isDark
              ? (isFailEdge ? '#7f1d1d' : '#4338ca')
              : (isFailEdge ? '#fecaca' : '#e5e7eb');

          return (
            <g key={edge.id}>
              <path
                d={path}
                fill="none"
                stroke={stroke}
                strokeWidth={isSelected || isFromConnectSource ? 3 : 2}
                strokeLinecap="round"
                opacity={isSelected || isFromConnectSource ? 0.95 : 0.7}
                markerEnd={`url(#${markerId})`}
              />
              <polygon
                points="0,-5 10,0 0,5"
                fill={isDark ? '#312e81' : '#ffffff'}
                stroke={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#9ca3af')}
                strokeWidth="1"
                transform={`translate(${getSmartArrowPos(edge, layout.nodes, nodeSizes)})`}
              />
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdgeSelect(edge.id);
                }}
              />
              {label && labelPos && (
                <g
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdgeSelect(edge.id);
                  }}
                >
                  <rect
                    x={parseInt(labelPos.split(',')[0], 10) - 30}
                    y={parseInt(labelPos.split(',')[1], 10) - 11}
                    width="60"
                    height="22"
                    rx="6"
                    fill={isSelected ? (isDark ? '#7f1d1d' : '#eef2ff') : (isDark ? '#4338ca' : '#ffffff')}
                    stroke={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#d1d5db')}
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
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {layout.nodes.map(node => (
        <EditableFlowNodeCard
          key={node.id}
          node={node}
          x={node.position.x}
          y={node.position.y}
          isSelected={selectedNodeId === node.id}
          isConnectSource={connectFromId === node.id}
          canMoveLeft={canMoveWithinRank(layout.ranks, node.id, -1)}
          canMoveRight={canMoveWithinRank(layout.ranks, node.id, 1)}
          nodeRef={(el) => setNodeRef(node.id, el)}
          onSelect={() => onNodeSelect(node.id)}
          onInsertAfter={() => onInsertAfter(node.id)}
          onStartConnecting={() => onStartConnecting(node.id)}
          onMove={(direction) => onMoveWithinRank(node.id, direction)}
          onDelete={() => onDeleteNode(node.id)}
        />
      ))}
    </div>
  );
}
