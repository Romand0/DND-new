import React from 'react';
import { Trash2 } from 'lucide-react';
import type { FlowDefinition, FlowNodeDef, FlowEdgeDef } from '@/types/flow';

interface NodeConnectionsProps {
  flow: FlowDefinition;
  selectedNode: FlowNodeDef;
  deleteEdge: (edgeId: string) => void;
  isDark: boolean;
}

export default function NodeConnections({
  flow,
  selectedNode,
  deleteEdge,
  isDark,
}: NodeConnectionsProps) {
  // 获取节点的出边
  const outgoingEdges = flow.edges.filter(edge => edge.from === selectedNode.id);
  
  // 获取节点的入边
  const incomingEdges = flow.edges.filter(edge => edge.to === selectedNode.id);

  // 获取节点标签
  const getNodeLabel = (nodeId: string) => {
    const node = flow.nodes.find(n => n.id === nodeId);
    return node?.label || nodeId;
  };

  return (
    <div className="space-y-3">
      {/* 出边列表 */}
      <div>
        <label className="text-xs font-medium dark:text-text-dark light:text-text-light block mb-1.5">
          出边连接
        </label>
        <div className="space-y-1">
          {outgoingEdges.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-text-dark-muted light:text-text-light-muted">
              无出边连接
            </div>
          ) : (
            outgoingEdges.map(edge => {
              const toNode = flow.nodes.find(n => n.id === edge.to);
              return (
                <div
                  key={edge.id}
                  className="flex items-center justify-between px-2 py-1 rounded bg-white/5 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] text-primary">
                      {edge.label || edge.trigger}
                    </span>
                    <span className="text-xs dark:text-text-dark light:text-text-light">
                      → {getNodeLabel(edge.to)}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteEdge(edge.id)}
                    className="p-0.5 rounded hover:bg-red-500/10 transition-colors"
                    title="删除连接"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 入边列表 */}
      <div>
        <label className="text-xs font-medium dark:text-text-dark light:text-text-light block mb-1.5">
          入边连接
        </label>
        <div className="space-y-1">
          {incomingEdges.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-text-dark-muted light:text-text-light-muted">
              无入边连接
            </div>
          ) : (
            incomingEdges.map(edge => {
              const fromNode = flow.nodes.find(n => n.id === edge.from);
              return (
                <div
                  key={edge.id}
                  className="flex items-center justify-between px-2 py-1 rounded bg-white/5 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs dark:text-text-dark light:text-text-light">
                      {getNodeLabel(edge.from)} →
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] text-primary">
                      {edge.label || edge.trigger}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}