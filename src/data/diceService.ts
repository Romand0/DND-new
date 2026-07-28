/**
 * 骰子服务 — 输入输出接口
 * 供其他功能（如战斗系统、技能检定等）调用的统一骰子接口
 */

export type DiceType = 4 | 6 | 8 | 10 | 12 | 20;
export type RollMode = 'sum' | 'independent';

/** 骰子请求 */
export interface DiceRequest {
  /** 骰子面数 */
  sides: DiceType;
  /** 掷骰次数 */
  count: number;
  /** 掷骰模式：累加求和 / 独立展示 */
  mode: RollMode;
  /** 可选：请求来源标识（用于回调匹配） */
  source?: string;
}

/** 骰子结果 */
export interface DiceResult {
  /** 骰子面数 */
  sides: DiceType;
  /** 每次掷出的原始值 */
  values: number[];
  /** 掷骰次数 */
  count: number;
  /** 模式 */
  mode: RollMode;
  /** 累加模式下的总和；独立模式下为 values[0]（兼容单值场景） */
  total: number;
  /** 请求来源 */
  source?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 执行一次骰子请求，返回结构化结果
 */
export function rollDice(request: DiceRequest): DiceResult {
  const { sides, count, mode, source } = request;
  const c = Math.max(1, Math.min(1000, count));
  const values: number[] = [];
  for (let i = 0; i < c; i++) {
    values.push(Math.floor(Math.random() * sides) + 1);
  }
  const total = mode === 'sum'
    ? values.reduce((a, b) => a + b, 0)
    : values[0];

  return {
    sides,
    values,
    count: c,
    mode,
    total,
    source,
    timestamp: Date.now(),
  };
}

// --- 订阅机制：允许其他组件监听骰子事件 ---

type DiceEventListener = (result: DiceResult) => void;

const listeners = new Set<DiceEventListener>();

/**
 * 订阅骰子事件（如批量掷骰、外部请求等）
 * 返回取消订阅函数
 */
export function subscribeDice(listener: DiceEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 广播骰子结果给所有订阅者
 */
export function broadcastDiceResult(result: DiceResult): void {
  listeners.forEach((l) => l(result));
}
