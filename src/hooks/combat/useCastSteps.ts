// 施法步骤状态机 hook —— 战斗施法的原子步骤推进
// 步骤类型与 types/castStep.ts 契约对齐；副作用延迟原则：
// 本 hook 只维护步骤轨迹与日志，绝不触碰参战者数据（HP/动作/先攻表格由宿主在收尾时一次性应用）。
import { useCallback, useRef, useState } from 'react';
import type { CastStepLog, CastStepStatus, CastStepType } from '@/types/castStep';

/** 检定方式（与 CombatSpellModal 内部 CheckType 同形，避免反向依赖组件） */
export type CastCheckType = 'ac' | 'save' | 'none';

/**
 * 步骤序列推导：按检定方式裁剪中间步骤。
 * 恒有 cast_start / apply_effect / cast_end；skipTarget=true（自身类法术）时
 * 跳过 select_target（目标恒为施法者自己）；checkType='none' 时无检定步骤
 * （apply_effect 恒保留，纯 buff 法术由 DM 走「跳过效果」出口记 0）。
 */
export function buildCastStepTypes(checkType: CastCheckType, skipTarget = false): CastStepType[] {
  const types: CastStepType[] = ['cast_start'];
  if (!skipTarget) types.push('select_target');
  if (checkType === 'ac') types.push('attack_roll');
  else if (checkType === 'save') types.push('saving_throw');
  types.push('apply_effect', 'cast_end');
  return types;
}

/** 单步骤运行态 */
export interface CastStepState {
  type: CastStepType;
  status: 'pending' | 'active' | CastStepStatus;
  forced: boolean;
  message?: string;
  data?: Record<string, unknown>;
  completedAt?: number;
}

function initState(checkType: CastCheckType, skipTarget = false): CastStepState[] {
  return buildCastStepTypes(checkType, skipTarget).map((type, i) => ({
    type,
    status: i === 0 ? 'active' : 'pending',
    forced: false,
  }));
}

export function useCastSteps() {
  const castIdRef = useRef(`cast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [steps, setSteps] = useState<CastStepState[]>(() => initState('ac'));
  const [checkType, setCheckType] = useState<CastCheckType>('ac');
  const [skipTarget, setSkipTarget] = useState(false);

  const currentIndex = steps.findIndex(s => s.status === 'active');
  const allDone = steps.length > 0 && steps.every(s => s.status !== 'pending' && s.status !== 'active');

  /** 开始一次新施法：重置 castId 与步骤序列（skipTarget = 自身类法术跳过目标选择） */
  const begin = useCallback((ct: CastCheckType, skip = false) => {
    castIdRef.current = `cast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCheckType(ct);
    setSkipTarget(skip);
    setSteps(initState(ct, skip));
  }, []);

  /** 检定类型切换（仅发生在检定步骤确认前）：重建序列，保留已完成的 cast_start / select_target 前缀 */
  const rebuild = useCallback((ct: CastCheckType) => {
    setCheckType(ct);
    setSteps(prev => {
      const nextTypes = buildCastStepTypes(ct, skipTarget);
      // 从头逐位匹配：类型相同且已完成（非 pending/active）的步骤保留为前缀
      const kept: CastStepState[] = [];
      for (let i = 0; i < nextTypes.length; i++) {
        const old = prev[i];
        if (old && old.type === nextTypes[i] && old.status !== 'pending' && old.status !== 'active') {
          kept.push(old);
        } else {
          break;
        }
      }
      // 前缀之后第一个步骤成为 active，其余 pending
      return nextTypes.map((type, i) =>
        i < kept.length
          ? kept[i]
          : ({ type, status: i === kept.length ? 'active' : 'pending', forced: false } as CastStepState)
      );
    });
  }, [skipTarget]);

  /** 完成当前步骤并推进（status 为三态之一；失败同样推进——失败轨迹也要进日志） */
  const completeCurrent = useCallback((status: CastStepStatus, message: string, data?: Record<string, unknown>) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.status === 'active');
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], status, message, data, completedAt: Date.now() };
      if (idx + 1 < next.length) {
        next[idx + 1] = { ...next[idx + 1], status: 'active' };
      }
      return next;
    });
  }, []);

  /** 强制施放：当前步骤记 partial 并携带 forced 标记，然后推进（R3.4/R4.2） */
  const forceCurrent = useCallback((message: string, data?: Record<string, unknown>) => {
    completeCurrent('partial', message, { ...(data ?? {}), forced: true });
  }, [completeCurrent]);

  /** 无痕中止：清空全部轨迹（关闭弹窗 = 无副作用） */
  const abort = useCallback(() => {
    setSteps(initState(checkType, skipTarget));
  }, [checkType, skipTarget]);

  /** 收尾时取全量日志（只含已完成步骤） */
  const collectLogs = useCallback((): CastStepLog[] => {
    return steps
      .filter(s => s.status !== 'pending' && s.status !== 'active')
      .map(s => ({
        id: crypto.randomUUID(),
        castId: castIdRef.current,
        stepType: s.type,
        status: s.status as CastStepStatus,
        message: s.message ?? '',
        data: s.data,
        timestamp: s.completedAt ?? Date.now(),
      }));
  }, [steps]);

  return {
    steps: steps as readonly CastStepState[],
    currentIndex,
    allDone,
    checkType,
    skipTarget,
    begin,
    rebuild,
    completeCurrent,
    forceCurrent,
    abort,
    collectLogs,
  };
}
