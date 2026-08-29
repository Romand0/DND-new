import React, { useCallback } from 'react';
import EdgeBasicInfo from './EdgeBasicInfo';
import EdgeTriggerSelector from './EdgeTriggerSelector';
import EdgeLabelEditor from './EdgeLabelEditor';
import EdgeConditionEditor from './EdgeConditionEditor';
import EdgeDataMapper from './EdgeDataMapper';
import EdgeActionButtons from './EdgeActionButtons';
import type { FlowDefinition, FlowEdgeDef } from '@/types/flow';
import type { UseTextInputResult } from '@/hooks/useInput';
import { useTextInput } from '@/hooks/useInput';

interface EdgePropertiesPanelProps {
  edge: FlowEdgeDef;
  flow: FlowDefinition;
  onUpdateEdge: (edgeId: string, updates: Partial<FlowEdgeDef>) => void;
  onDeleteEdge: (edgeId: string) => void;
  isDark: boolean;
}

export default function EdgePropertiesPanel({
  edge,
  flow,
  onUpdateEdge,
  onDeleteEdge,
  isDark
}: EdgePropertiesPanelProps) {
  // 输入状态管理
  const edgeLabelInput = useTextInput(edge.label ?? '');
  const edgeConditionInput = useTextInput(edge.condition ?? '');
  const edgeDataMapInput = useTextInput(
    edge.dataMap ? JSON.stringify(edge.dataMap, null, 2) : ''
  );

  // 更新函数
  const updateEdge = useCallback((updates: Partial<FlowEdgeDef>) => {
    onUpdateEdge(edge.id, updates);
  }, [edge.id, onUpdateEdge]);

  return (
    <div className="space-y-4">
      <EdgeBasicInfo edge={edge} isDark={isDark} />
      <EdgeTriggerSelector 
        edge={edge} 
        onUpdateEdge={updateEdge}
        isDark={isDark}
      />
      <EdgeLabelEditor
        edge={edge}
        edgeLabelInput={edgeLabelInput}
        onUpdateEdge={updateEdge}
        isDark={isDark}
      />
      <EdgeConditionEditor
        edge={edge}
        edgeConditionInput={edgeConditionInput}
        onUpdateEdge={updateEdge}
        isDark={isDark}
      />
      <EdgeDataMapper
        edge={edge}
        edgeDataMapInput={edgeDataMapInput}
        onUpdateEdge={updateEdge}
        isDark={isDark}
      />
      <EdgeActionButtons
        edge={edge}
        onDeleteEdge={onDeleteEdge}
        isDark={isDark}
      />
    </div>
  );
}