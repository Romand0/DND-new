import React, { useCallback, useReducer } from 'react';
import { useTextInput } from '@/hooks/useInput';
import { NODE_CONFIG_SCHEMA, NODE_TYPE_REGISTRY } from '@/types/flow';
import NodeBasicInfo from './NodeBasicInfo';
import NodeConfigForm from './NodeConfigForm';
import NodeCustomFields from './NodeCustomFields';
import NodeConnections from './NodeConnections';
import ConfigFieldRenderer from '@/components/ConfigFieldRenderer';
import ExtraConfigField from './ExtraConfigField';
import type { FlowDefinition, FlowNodeDef } from '@/types/flow';
import { resolveNodeIcon } from '../nodeIcon';
import { Trash2 } from 'lucide-react';

// 定义节点状态类型
interface NodeState {
  node: FlowNodeDef;
}

// 定义reducer的类型
type FlowAction = 
  | { type: 'UPDATE_NODE_CONFIG'; nodeId: string; key: string; value: any }
  | { type: 'UPDATE_NODE_LABEL'; nodeId: string; label: string }
  | { type: 'UPDATE_NODE_NOTES'; nodeId: string; notes: string }
  | { type: 'DELETE_EDGE'; edgeId: string };

// reducer函数
function nodeReducer(state: NodeState, action: FlowAction): NodeState {
  switch (action.type) {
    case 'UPDATE_NODE_CONFIG':
      if (state.node.id === action.nodeId) {
        return {
          ...state,
          node: {
            ...state.node,
            config: {
              ...state.node.config,
              [action.key]: action.value
            }
          }
        };
      }
      return state;
    
    case 'UPDATE_NODE_LABEL':
      if (state.node.id === action.nodeId) {
        return {
          ...state,
          node: {
            ...state.node,
            label: action.label
          }
        };
      }
      return state;
    
    case 'UPDATE_NODE_NOTES':
      if (state.node.id === action.nodeId) {
        return {
          ...state,
          node: {
            ...state.node,
            notes: action.notes
          }
        };
      }
      return state;
    
    default:
      return state;
  }
}

interface FlowPropertiesNodeEditorProps {
  node: FlowNodeDef;
  flow: FlowDefinition;
  isDark: boolean;
  updateNodeConfig: (nodeId: string, key: string, value: any) => void;
  deleteEdge: (edgeId: string) => void;
  selectedEdgeId?: string | null;
  setSelectedEdgeId?: (edgeId: string | null) => void;
}

export default function FlowPropertiesNodeEditor({
  node,
  flow,
  isDark,
  updateNodeConfig,
  deleteEdge,
  selectedEdgeId,
  setSelectedEdgeId,
}: FlowPropertiesNodeEditorProps) {
  // 使用reducer管理节点状态
  const [nodeState, dispatch] = useReducer(nodeReducer, { node });

  // 更新节点配置
  const handleUpdateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    dispatch({
      type: 'UPDATE_NODE_CONFIG',
      nodeId,
      key,
      value,
    });
  }, []);

  // 更新节点标签
  const handleUpdateNodeLabel = useCallback((nodeId: string, label: string) => {
    dispatch({
      type: 'UPDATE_NODE_LABEL',
      nodeId,
      label,
    });
  }, []);

  // 更新节点备注
  const handleUpdateNodeNotes = useCallback((nodeId: string, notes: string) => {
    dispatch({
      type: 'UPDATE_NODE_NOTES',
      nodeId,
      notes,
    });
  }, []);

  // 删除边
  const handleDeleteEdge = useCallback((edgeId: string) => {
    dispatch({
      type: 'DELETE_EDGE',
      edgeId,
    });
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-6 h-6 rounded flex items-center justify-center text-white"
          style={{ backgroundColor: NODE_TYPE_REGISTRY.find(m => m.type === nodeState.node.type)?.color || '#6b7280' }}
        >
          {resolveNodeIcon(NODE_TYPE_REGISTRY.find(m => m.type === nodeState.node.type)?.icon)}
        </span>
        <div>
          <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">
            {nodeState.node.label}
          </h3>
          <p className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
            {nodeState.node.type}
          </p>
        </div>
      </div>

      {/* 节点 ID（只读） */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
          节点 ID
        </label>
        <input
          type="text"
          value={nodeState.node.id}
          readOnly
          className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light opacity-60"
        />
      </div>

      {/* 显示名称 */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
          显示名称
        </label>
        <input
          type="text"
          value={nodeState.node.label}
          onChange={(e) => {
            handleUpdateNodeLabel(node.id, e.target.value);
          }}
          onBlur={(e) => {
            const trimmed = e.target.value.trim();
            if (trimmed !== e.target.value) {
              handleUpdateNodeLabel(node.id, trimmed);
            }
          }}
          className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
        />
      </div>

      {/* 配置项 —— Schema 驱动 */}
      {(() => {
        const fields = NODE_CONFIG_SCHEMA[nodeState.node.type] ?? [];
        return (
          <div className="mb-3">
            <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-2">
              配置项
            </label>

            {/* Schema 定义的字段：中文标签 + 专用控件 */}
            {fields.length > 0 ? (
              <div className="space-y-3">
                {fields.map(field => (
                  <div key={field.key}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
                        {field.label}
                      </span>
                      {field.required && <span className="text-[10px] text-red-400">*</span>}
                    </div>
                    <ConfigFieldRenderer
                      schema={field}
                      value={nodeState.node.config?.[field.key]}
                      onChange={v => handleUpdateNodeConfig(node.id, field.key, v)}
                      isDark={isDark}
                      parentValue={nodeState.node.config}
                    />
                    {/* DSL 值提示：底部小字显示实际存储值 */}
                    <div className="text-[10px] font-mono mt-0.5 dark:text-text-dark-muted light:text-text-light-muted">
                      {field.key} = {String(nodeState.node.config?.[field.key] ?? field.defaultValue ?? '')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">
                该节点无可配置项
              </p>
            )}

            {/* Schema 之外的自定义额外字段（保留灵活性） */}
            {(() => {
              const schemaKeys = new Set(fields.map(f => f.key));
              const extra = Object.entries(nodeState.node.config || {}).filter(([k]) => !schemaKeys.has(k));
              if (extra.length === 0) return null;
              return (
                <div className="mt-3 pt-3 border-t dark:border-border-dark light:border-border-light">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">自定义字段</span>
                    <button
                      onClick={() => {
                        const key = prompt('请输入配置项名称:');
                        if (key) handleUpdateNodeConfig(node.id, key, '');
                      }}
                      className="text-xs text-primary hover:underline"
                    >+ 添加</button>
                  </div>
                  <div className="space-y-2">
                    {extra.map(([key, value]) => (
                      <ExtraConfigField
                        key={key}
                        label={key}
                        value={String(value)}
                        onValueChange={(v) => handleUpdateNodeConfig(node.id, key, v)}
                        onRemove={() => {
                          // 删除自定义字段
                          const newConfig = { ...nodeState.node.config };
                          delete newConfig[key];
                          handleUpdateNodeConfig(node.id, '__config_update__', newConfig);
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* 备注 */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
          备注
        </label>
        <textarea
          value={nodeState.node.notes || ''}
          onChange={(e) => {
            handleUpdateNodeNotes(node.id, e.target.value);
          }}
          onBlur={(e) => {
            const trimmed = e.target.value.trim();
            if (trimmed !== e.target.value) {
              handleUpdateNodeNotes(node.id, trimmed);
            }
          }}
          rows={3}
          className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none resize-none"
          placeholder="添加备注..."
        />
      </div>

      {/* 出边列表 */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-2">
          出边连接
        </label>
        <div className="space-y-1">
          {flow.edges.filter(e => e.from === node.id).map(edge => {
            const toNode = flow.nodes.find(n => n.id === edge.to);
            return (
              <div
                key={edge.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer ${
                  selectedEdgeId === edge.id ? 'bg-primary/10' : 'hover:bg-white/5'
                }`}
                onClick={() => setSelectedEdgeId?.(edge.id)}
              >
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">
                  {edge.label || edge.trigger}
                </span>
                <span className="dark:text-text-dark light:text-text-light truncate">
                  → {toNode?.label || edge.to}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteEdge(edge.id);
                  }}
                  className="ml-auto p-0.5 rounded hover:bg-white/10 text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {flow.edges.filter(e => e.from === node.id).length === 0 && (
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted italic">
              暂无出边
            </p>
          )}
        </div>
      </div>

      {/* 入边列表 */}
      <div>
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-2">
          入边连接
        </label>
        <div className="space-y-1">
          {flow.edges.filter(e => e.to === node.id).map(edge => {
            const fromNode = flow.nodes.find(n => n.id === edge.from);
            return (
              <div
                key={edge.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer ${
                  selectedEdgeId === edge.id ? 'bg-primary/10' : 'hover:bg-white/5'
                }`}
                onClick={() => setSelectedEdgeId?.(edge.id)}
              >
                <span className="dark:text-text-dark light:text-text-light truncate">
                  {fromNode?.label || edge.from} →
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">
                  {edge.label || edge.trigger}
                </span>
              </div>
            );
          })}
          {flow.edges.filter(e => e.to === node.id).length === 0 && (
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted italic">
              暂无入边
            </p>
          )}
        </div>
      </div>
    </div>
  );
}