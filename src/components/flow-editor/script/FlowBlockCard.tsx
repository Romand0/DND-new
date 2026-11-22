import React from 'react';
import { GripVertical, Trash2, GitBranch, Shield, Zap, MousePointer, Heart, CheckCircle } from 'lucide-react';
import type { ScriptBlock, ScriptIf } from '@/types/flowScript';
import { BLOCK_SHAPE_REGISTRY } from '@/types/flowScript';
import type { FlowNodeType } from '@/types/flow';
import { NODE_TYPE_REGISTRY, NODE_CONFIG_SCHEMA, isConfigFieldVisible } from '@/types/flow';
import FlowDropSlot from './FlowDropSlot';
import type { SlotPath, BranchName } from '@/lib/flowScriptTree';

// 积木卡片：三种形态（hat 帽子 / step 堆叠 / if C 形双插槽）。
// 块通过容器路径（viaIds + branches）寻址：插槽路径 = 容器路径 + 自身所在分支。
// 拖拽走 beginDrag（拖柄），点击选中由 dnd 状态机回灌；删除就地操作。

const TYPE_ICONS: Record<FlowNodeType, React.ReactNode> = {
  cast_start: <Zap className="w-3.5 h-3.5" />,
  select_target: <MousePointer className="w-3.5 h-3.5" />,
  saving_throw: <Shield className="w-3.5 h-3.5" />,
  attack_roll: <Zap className="w-3.5 h-3.5" />,
  condition_branch: <GitBranch className="w-3.5 h-3.5" />,
  apply_effect: <Heart className="w-3.5 h-3.5" />,
  scaled_effect: <Heart className="w-3.5 h-3.5" />,
  concentration_check: <Shield className="w-3.5 h-3.5" />,
  cast_end: <CheckCircle className="w-3.5 h-3.5" />,
  custom: <Zap className="w-3.5 h-3.5" />,
};

function typeMeta(type: FlowNodeType) {
  return NODE_TYPE_REGISTRY.find(m => m.type === type);
}

/** 配置摘要：取 schema 前 2 个可见字段的「标签: 值」 */
function configSummary(nodeType: FlowNodeType, config?: Record<string, any>): string {
  const fields = NODE_CONFIG_SCHEMA[nodeType] ?? [];
  const parts: string[] = [];
  const evaluated = { ...config };
  for (const f of fields) {
    if (parts.length >= 2) break;
    if (!isConfigFieldVisible(f, evaluated) || f.type === 'object') continue;
    const v = config?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${f.label}: ${String(v).slice(0, 18)}`);
    evaluated[f.key] = v;
  }
  return parts.join(' · ');
}

interface BlockCommonProps {
  isDark: boolean;
  selectedId: string | null;
  dragging: boolean;
  dragId: string | null;
  activeSlotKey: string | null;
  /** 只读渲染（FlowView 预览）：无拖柄、无删除钮、插槽不可点 */
  readOnly?: boolean;
  beginDrag: (e: React.PointerEvent, blockId: string) => void;
  onDelete: (blockId: string) => void;
  onSlotPick: (slotKey: string) => void;
  slotKeyOf: (path: SlotPath) => string;
}

interface FlowBlockCardProps extends BlockCommonProps {
  block: ScriptBlock;
  /** 本块所在容器的路径（顶层为空） */
  viaIds: string[];
  branches: BranchName[];
  isHat?: boolean;
}

export const FlowBlockCard: React.FC<FlowBlockCardProps> = ({
  block,
  viaIds,
  branches,
  isDark,
  selectedId,
  dragging,
  dragId,
  activeSlotKey,
  isHat,
  readOnly,
  beginDrag,
  onDelete,
  onSlotPick,
  slotKeyOf,
}) => {
  const nodeType = (block as { nodeType?: FlowNodeType }).nodeType ?? 'custom';
  const meta = typeMeta(nodeType);
  const color = meta?.color ?? '#6b7280';
  const selected = selectedId === block.id;
  const ghosting = dragId === block.id;
  const isC = block.kind === 'if';

  const header = (
    <div
      data-node-id={block.id}
      className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-shadow ${
        selected ? 'border-primary shadow-md ring-1 ring-primary/40' : isDark ? 'border-border-dark' : 'border-border-light'
      } ${ghosting ? 'opacity-40' : ''} ${isHat ? 'rounded-b-none rounded-t-2xl border-b-0' : ''}`}
      style={{ borderLeft: `4px solid ${color}`, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fff' }}
    >
      <span
        onPointerDown={isHat || readOnly ? undefined : e => beginDrag(e, block.id)}
        className={`flex-shrink-0 touch-none ${isHat ? 'opacity-30' : readOnly ? 'opacity-50' : 'opacity-50 hover:opacity-100'} ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        title={isHat ? '入口块固定在顶部' : '拖动移动块（含子块）'}
      >
        <GripVertical className="w-4 h-4" style={{ color }} />
      </span>
      <span className="flex-shrink-0" style={{ color }}>{TYPE_ICONS[nodeType]}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color }}>{block.label}</div>
        <div className="text-[10px] text-gray-400 truncate">
          {block.kind === 'if' && block.condition
            ? `条件: ${block.condition}`
            : configSummary(nodeType, block.config) || meta?.label || ''}
        </div>
      </div>
      {isC && <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />}
      {!isHat && !readOnly && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(block.id); }}
          className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity"
          title="删除块（含子块）"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  if (!isC) return header;

  // C 形块：头卡 + 双分支插槽体 + C 口收底
  const cBlock = block as ScriptIf;
  const pair = BLOCK_SHAPE_REGISTRY[nodeType]?.cPair;
  const trueLabel = pair?.trueLabel ?? '满足';
  const falseLabel = pair?.falseLabel ?? '否则';
  const bodyPath = { viaIds: [...viaIds, cBlock.id], branches };

  return (
    <div className={`rounded-lg border-l-4 ${ghosting ? 'opacity-40' : ''}`} style={{ borderLeftColor: color }}>
      {header}
      <div className="py-1 pr-1">
        <BranchBody
          label={trueLabel}
          blocks={cBlock.onTrue}
          containerPath={{ viaIds: bodyPath.viaIds, branches: [...branches, 'onTrue'] }}
          {...{ isDark, selectedId, dragging, dragId, activeSlotKey, readOnly, beginDrag, onDelete, onSlotPick, slotKeyOf }}
        />
        <BranchBody
          label={falseLabel}
          blocks={cBlock.onFalse}
          containerPath={{ viaIds: bodyPath.viaIds, branches: [...branches, 'onFalse'] }}
          {...{ isDark, selectedId, dragging, dragId, activeSlotKey, readOnly, beginDrag, onDelete, onSlotPick, slotKeyOf }}
        />
      </div>
      <div
        className="h-2 rounded-b-lg border border-t-0"
        style={{ borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)' }}
      />
    </div>
  );
};

interface BranchBodyProps extends BlockCommonProps {
  label: string;
  blocks: ScriptBlock[];
  containerPath: { viaIds: string[]; branches: BranchName[] };
}

/** 单分支体：插槽 + 子块递归 */
const BranchBody: React.FC<BranchBodyProps> = ({ label, blocks, containerPath, ...common }) => {
  const { isDark, dragging, dragId, activeSlotKey, onSlotPick, slotKeyOf } = common;
  const slotPath = (index: number): SlotPath => ({ viaIds: containerPath.viaIds, branches: containerPath.branches, index });

  return (
    <div className={`pl-4 border-l-2 ${isDark ? 'border-white/10' : 'border-black/10'} my-1`}>
      <div className="text-[10px] font-medium text-gray-400 py-0.5">{label}</div>
      {blocks.map((b, i) => (
        <React.Fragment key={b.id}>
          <FlowDropSlot
            slotKey={slotKeyOf(slotPath(i))}
            active={dragging && activeSlotKey === slotKeyOf(slotPath(i))}
            dragging={dragging}
            readOnly={common.readOnly}
            onPick={onSlotPick}
          />
          <FlowBlockCard
            block={b}
            viaIds={containerPath.viaIds}
            branches={containerPath.branches}
            {...common}
          />
        </React.Fragment>
      ))}
      <FlowDropSlot
        slotKey={slotKeyOf(slotPath(blocks.length))}
        active={dragging && activeSlotKey === slotKeyOf(slotPath(blocks.length))}
        dragging={dragging}
        readOnly={common.readOnly}
        onPick={onSlotPick}
      />
    </div>
  );
};

export default FlowBlockCard;
