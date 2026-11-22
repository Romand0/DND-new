import type { FlowScript, ScriptBlock, ScriptIf, ScriptStep } from '@/types/flowScript';
import { BLOCK_SHAPE_REGISTRY } from '@/types/flowScript';
import type { FlowNodeType } from '@/types/flow';

// ======================
// 脚本树纯操作（不可变更新）
// ======================
//
// 编辑器拖拽/插入/删除/改配置的唯一数据通道。
// 位置寻址用 SlotPath（容器路径 + 插入下标），块寻址用 id。

/**
 * 插槽定位：从脚本 body 根出发逐层进入分支容器，最终落在 container 的 index 位置。
 * branches 为空表示顶层 body；每级 branchName 指明进入哪个分支体（按块 id 寻路）。
 */
export interface SlotPath {
  /** 寻路块 id 序列：body 中依次进入的 C 形块 */
  viaIds: string[];
  /** 每级进入的分支体：与 viaIds 等长 */
  branches: BranchName[];
  /** 目标容器内的插入下标（0 = 最前） */
  index: number;
}

export type BranchName = 'onTrue' | 'onFalse';

export function slotKey(path: SlotPath): string {
  return path.viaIds.join('/') + '|' + path.branches.join('/') + '|' + path.index;
}

/** slotKey 的逆解析（拖拽命中提交用） */
export function parseSlotKey(key: string): SlotPath {
  const [via, branches, index] = key.split('|');
  return {
    viaIds: via ? via.split('/').filter(Boolean) : [],
    branches: (branches ? branches.split('/').filter(Boolean) : []) as ('onTrue' | 'onFalse')[],
    index: Number(index) || 0,
  };
}

/** 沿路径取出目标容器（数组引用，仅内部使用）；找不到返回 null */
function resolveContainer(body: ScriptBlock[], path: SlotPath): ScriptBlock[] | null {
  let container = body;
  for (let i = 0; i < path.viaIds.length; i++) {
    const found = container.find(b => b.id === path.viaIds[i]);
    if (!found || found.kind !== 'if') return null;
    const branchName = path.branches[i];
    if (branchName === 'onTrue') {
      container = found.onTrue;
    } else {
      container = found.onFalse;
    }
  }
  return container;
}

/** 在插槽处插入块（不可变），返回新 body；路径无效返回原引用 */
export function insertBlock(body: ScriptBlock[], path: SlotPath, block: ScriptBlock): ScriptBlock[] {
  const container = resolveContainer(body, path);
  if (!container) return body;
  const idx = Math.max(0, Math.min(path.index, container.length));
  const next = [...container];
  next.splice(idx, 0, block);

  // 自底向上重建路径上的 C 形块（不可变）
  return rebuildPath(body, path, () => next);
}

/** 从树中摘出块（含子树），返回 [新 body, 被摘出的块]；找不到返回 [原 body, null] */
export function removeBlock(body: ScriptBlock[], blockId: string): [ScriptBlock[], ScriptBlock | null] {
  let removed: ScriptBlock | null = null;

  const strip = (list: ScriptBlock[]): ScriptBlock[] => {
    const out: ScriptBlock[] = [];
    for (const b of list) {
      if (b.id === blockId) {
        removed = b;
        continue;
      }
      out.push(b.kind === 'if' ? { ...b, onTrue: strip(b.onTrue), onFalse: strip(b.onFalse) } : b);
    }
    return out;
  };

  const next = strip(body);
  return removed ? [next, removed] : [body, null];
}

/** 树中查找块 */
export function findBlock(body: ScriptBlock[], blockId: string): ScriptBlock | null {
  for (const b of body) {
    if (b.id === blockId) return b;
    if (b.kind === 'if') {
      const inTrue = findBlock(b.onTrue, blockId);
      if (inTrue) return inTrue;
      const inFalse = findBlock(b.onFalse, blockId);
      if (inFalse) return inFalse;
    }
  }
  return null;
}

/** 局部更新补丁：kind 不可改，其余字段可选 */
export type BlockPatch = Partial<Omit<ScriptStep, 'kind' | 'nodeType' | 'id'>> &
  Partial<Omit<ScriptIf, 'kind' | 'nodeType' | 'id'>>;

/** 局部更新块（保留子树），返回新 body；找不到返回原引用 */
export function updateBlock(body: ScriptBlock[], blockId: string, patch: BlockPatch): ScriptBlock[] {
  return body.map(b => {
    if (b.id === blockId) return { ...b, ...patch } as ScriptBlock;
    if (b.kind === 'if') {
      const onTrue = updateBlock(b.onTrue, blockId, patch);
      const onFalse = updateBlock(b.onFalse, blockId, patch);
      if (onTrue !== b.onTrue || onFalse !== b.onFalse) return { ...b, onTrue, onFalse };
    }
    return b;
  });
}

/** 删除块（不含保留语义，直接摘除） */
export function deleteBlock(body: ScriptBlock[], blockId: string): ScriptBlock[] {
  const [next] = removeBlock(body, blockId);
  return next;
}

/** 遍历全部块（先序） */
export function walkBlocks(body: ScriptBlock[], fn: (b: ScriptBlock) => void): void {
  for (const b of body) {
    fn(b);
    if (b.kind === 'if') {
      walkBlocks(b.onTrue, fn);
      walkBlocks(b.onFalse, fn);
    }
  }
}

/**
 * 拖拽移动：从 originId 摘出子树，插入目标插槽。
 * 目标位于被摘子树内部时取消（会把自己的祖先一起拖走，语义不成立）。
 */
export function moveBlock(
  body: ScriptBlock[],
  originId: string,
  target: SlotPath,
): ScriptBlock[] {
  const [stripped, block] = removeBlock(body, originId);
  if (!block) return body;
  // 目标容器路径上有被摘块自身 → 取消
  if (target.viaIds.includes(originId)) return body;
  return insertBlock(stripped, target, block);
}

/** 重建路径工具：沿 path 进入容器后用 provided 替换，再逐级展开回新树 */
function rebuildPath(
  body: ScriptBlock[],
  path: SlotPath,
  leaf: () => ScriptBlock[],
): ScriptBlock[] {
  if (path.viaIds.length === 0) return leaf();

  // 递归进入最后一级
  const enter = (list: ScriptBlock[], depth: number): ScriptBlock[] => {
    const id = path.viaIds[depth];
    const branchName = path.branches[depth];
    return list.map(b => {
      if (b.id !== id || b.kind !== 'if') return b;
      if (depth === path.viaIds.length - 1) {
        return branchName === 'onTrue'
          ? { ...b, onTrue: leaf() }
          : { ...b, onFalse: leaf() };
      }
      return branchName === 'onTrue'
        ? { ...b, onTrue: enter(b.onTrue, depth + 1) }
        : { ...b, onFalse: enter(b.onFalse, depth + 1) };
    });
  };

  return enter(body, 0);
}

// ======================
// 块形态判定（数据决定实际形态）
// ======================

/** C 形类型但以堆叠形态存在（无分流体）时，返回空体 C 块的默认形态 */
export function isCType(nodeType: FlowNodeType): boolean {
  return BLOCK_SHAPE_REGISTRY[nodeType]?.shape === 'c';
}

/** 块是否为 C 形数据形态（kind='if'） */
export function isIfBlock(b: ScriptBlock): b is ScriptIf {
  return b.kind === 'if';
}

/**
 * 检定/命中块形态转换：堆叠 ⇄ C 形。
 *
 * 语义分层（battleflow 设计原则）：检定块默认「堆叠」= 结果信号沿链传递，由下游
 * 效果节点自行消化（如 apply_effect.halfDamageOnSave 吃上游豁免结果）；「C 形」=
 * 显式结果分流，仅在两个结果要走完全不同的效果链时使用。condition_branch 的
 * 存在意义即分流，不参与转换。
 *
 * 返回新 body；无需变更返回原引用；不可转换（非检定类型 / 收敛时分支体非空）返回 null。
 */
export function convertBlockForm(body: ScriptBlock[], blockId: string, to: 'step' | 'if'): ScriptBlock[] | null {
  const target = findBlock(body, blockId);
  if (!target) return null;
  if (target.nodeType === 'condition_branch' || !isCType(target.nodeType)) return null;
  if (target.kind === to) return body;
  if (to === 'step' && target.kind === 'if' && (target.onTrue.length > 0 || target.onFalse.length > 0)) return null;

  const conv = (b: ScriptBlock): ScriptBlock => {
    if (b.id === blockId) {
      if (to === 'step') {
        const src = b as ScriptIf;
        return { kind: 'step', nodeType: src.nodeType, id: src.id, label: src.label, config: src.config, notes: src.notes };
      }
      const src = b as ScriptStep;
      return { kind: 'if', nodeType: src.nodeType, id: src.id, label: src.label, config: src.config, notes: src.notes, onTrue: [], onFalse: [] };
    }
    if (b.kind === 'if') return { ...b, onTrue: b.onTrue.map(conv), onFalse: b.onFalse.map(conv) };
    return b;
  };
  return body.map(conv);
}
