import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 受控输入的「字符串 state + 数值 state 分离」模式。
 *
 * 为什么用：原生 number input 用 `parseInt(e.target.value) || 0` 兜底会导致
 * 用户在输入过程中清空时立刻被填回 0，无法删除全部数字重新输入（典型痛点：
 * 把 100 改成 50 必须先删成 "10" 再改 "5"，不能清空再输 "50"）。
 *
 * 本 hook 把"输入态字符串"和"业务态数值"分离：
 *   - onChange 只更新 text（用户可以任意清空 / 输入中间态如 "-" / "1."）
 *   - value 跟随 text 解析，无效时回退到上一个有效值（避免业务逻辑拿到 NaN）
 *   - onBlur 时若 text 为空或 NaN，按 fallback 补全占位（"光标消失时才补全"）
 *
 * 与 §5.1 equipmentFactory 同属"统一入口消除重复"思路：所有数字输入都走这里，
 * 兜底值由 options.fallback 显式声明，不在每个 onChange 里散写 `|| N`。
 */

export interface UseNumberInputOptions {
  /** 失焦时若 text 为空或 NaN 的补全值。默认 0。 */
  fallback?: number;
  /**
   * 是否允许失焦后保持空（text='', value=undefined）。
   * 默认 false（失焦必补全 fallback）。
   * 设为 true 时调用方需自行处理 value === undefined 的业务逻辑
   * （例如 TreasureEdit 的 normalRange/maxRange 可选字段）。
   */
  allowEmpty?: boolean;
  /** 解析函数，默认 parseInt(s, 10)。改 parseFloat 可支持小数。 */
  parse?: (s: string) => number;
}

export interface UseNumberInputResult {
  /** 输入框显示的字符串（输入态，可能为空或部分输入如 "-"） */
  text: string;
  /** 当前业务数值；输入无效时为上一个有效值，allowEmpty 模式下可能为 undefined */
  value: number | undefined;
  /** onChange 处理器：只更新 text，不立即兜底 */
  onChange: (s: string) => void;
  /** onBlur 处理器：text 为空或 NaN 时按 fallback 补全 */
  onBlur: () => void;
  /** 外部程序化设置值（同时更新 text 和 value） */
  setExternal: (n: number) => void;
  /** 直接重置为初始值 */
  reset: () => void;
}

export function useNumberInput(
  initialValue: number,
  options: UseNumberInputOptions = {},
): UseNumberInputResult {
  const {
    fallback = 0,
    allowEmpty = false,
    parse = (s: string) => parseInt(s, 10),
  } = options;

  const initRef = useRef(initialValue);
  const [text, setText] = useState<string>(String(initialValue));
  const [value, setValue] = useState<number | undefined>(initialValue);

  // 外部 initialValue 变化时同步（例如父组件切换 record 后重置表单）
  useEffect(() => {
    if (initialValue !== initRef.current) {
      initRef.current = initialValue;
      setText(String(initialValue));
      setValue(initialValue);
    }
  }, [initialValue]);

  const onChange = useCallback((s: string) => {
    setText(s);
    if (s === '' || s === '-' || s === '.') {
      // 输入中间态：保持上一个 value 不变，避免业务逻辑拿到 NaN
      return;
    }
    const n = parse(s);
    if (!Number.isNaN(n)) {
      setValue(n);
    }
  }, [parse]);

  const onBlur = useCallback(() => {
    if (text === '' || text === '-' || text === '.') {
      if (allowEmpty) {
        setValue(undefined);
        return;
      }
      setText(String(fallback));
      setValue(fallback);
      return;
    }
    const n = parse(text);
    if (Number.isNaN(n)) {
      if (allowEmpty) {
        setText('');
        setValue(undefined);
        return;
      }
      setText(String(fallback));
      setValue(fallback);
    } else {
      // 规范化显示（如 "01" → "1"）
      setText(String(n));
      setValue(n);
    }
  }, [text, parse, fallback, allowEmpty]);

  const setExternal = useCallback((n: number) => {
    setText(String(n));
    setValue(n);
  }, []);

  const reset = useCallback(() => {
    setText(String(initRef.current));
    setValue(initRef.current);
  }, []);

  return { text, value, onChange, onBlur, setExternal, reset };
}

/**
 * 文本输入的同等封装：onChange 不 trim / 不补全，onBlur 时按需 trim 和补 fallback。
 *
 * 为什么用：避免「输入过程中 trim 导致光标跳到末尾」「输入还没结束就被补默认值」
 * 这类体验问题。和 useNumberInput 同源思路。
 */
export interface UseTextInputOptions {
  /** 失焦时若 text trim 后为空的补全值。默认 ''（即不补）。 */
  fallback?: string;
  /** 失焦时是否 trim。默认 true。 */
  trimOnBlur?: boolean;
}

export interface UseTextInputResult {
  text: string;
  value: string;
  onChange: (s: string) => void;
  onBlur: () => void;
  setExternal: (s: string) => void;
  reset: () => void;
}

export function useTextInput(
  initialValue: string,
  options: UseTextInputOptions = {},
): UseTextInputResult {
  const { fallback = '', trimOnBlur = true } = options;
  const initRef = useRef(initialValue);
  const [text, setText] = useState<string>(initialValue);
  const [value, setValue] = useState<string>(initialValue);

  useEffect(() => {
    if (initialValue !== initRef.current) {
      initRef.current = initialValue;
      setText(initialValue);
      setValue(initialValue);
    }
  }, [initialValue]);

  const onChange = useCallback((s: string) => {
    setText(s);
    setValue(s);
  }, []);

  const onBlur = useCallback(() => {
    let normalized = text;
    if (trimOnBlur) normalized = normalized.trim();
    if (normalized === '' && fallback) {
      normalized = fallback;
    }
    setText(normalized);
    setValue(normalized);
  }, [text, trimOnBlur, fallback]);

  const setExternal = useCallback((s: string) => {
    setText(s);
    setValue(s);
  }, []);

  const reset = useCallback(() => {
    setText(initRef.current);
    setValue(initRef.current);
  }, []);

  return { text, value, onChange, onBlur, setExternal, reset };
}
