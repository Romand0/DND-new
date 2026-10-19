// 流程表达式安全求值器 —— tokenizer + 递归下降解析，替代 condition_branch 的裸 eval
// 白名单语法：数字 / + - * / % / 括号 / 比较(> >= < <= == !=) / 逻辑(&& || !) /
// 骰式 NdM / dN / min max floor ceil abs / 变量与成员访问（a.b.c，从 scope 解析，未知变量报错）
// 有意不支持：赋值、函数定义、任意函数调用、索引写入——表达式只读求值。

interface Token {
  type: 'num' | 'dice' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'dot';
  value: string;
}

type Value = number | boolean;

const OP_TOKENS = ['>=', '<=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '>', '<', '!'];
const BUILTIN_FNS = ['min', 'max', 'floor', 'ceil', 'abs'] as const;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      // 骰式字面量优先整体捕获（NdM），避免被拆成数字 + dN 两个 token
      const diceLiteral = /^([0-9]+d[0-9]+)/i.exec(src.slice(i));
      if (diceLiteral) {
        tokens.push({ type: 'dice', value: diceLiteral[1] });
        i += diceLiteral[1].length;
        continue;
      }
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'num', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '(') { tokens.push({ type: 'lparen', value: ch }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ch }); i++; continue; }
    if (ch === '.') { tokens.push({ type: 'dot', value: ch }); i++; continue; }
    const two = src.slice(i, i + 2);
    if (OP_TOKENS.includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
    if (OP_TOKENS.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    throw new Error(`表达式含非法字符: "${ch}"（位置 ${i}）`);
  }
  return tokens;
}

function resolveIdentifier(name: string, scope: Record<string, unknown>): unknown {
  if (!(name in scope)) {
    throw new Error(`表达式引用了未知变量: ${name}`);
  }
  return scope[name];
}

function memberAccess(base: unknown, prop: string): unknown {
  if (base === null || base === undefined) {
    throw new Error(`表达式访问了空值的属性: .${prop}`);
  }
  if (typeof base !== 'object' && typeof base !== 'function') {
    throw new Error(`表达式对原始值访问属性: .${prop}`);
  }
  if (!(prop in (base as Record<string, unknown>))) {
    throw new Error(`表达式引用了未知属性: .${prop}`);
  }
  return (base as Record<string, unknown>)[prop];
}

/** 骰式 NdM 掷骰；rollFn 注入以便测试与确定性复现 */
function rollDiceExpr(count: number, sides: number, rollFn: (sides: number) => number): number {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += rollFn(sides);
  return sum;
}

export interface EvalOptions {
  /** 骰子随机源（默认 dN 均匀随机）；注入可实现确定性测试 */
  rollFn?: (sides: number) => number;
}

/**
 * 求值流程表达式。
 * @param expr 表达式原文（如 "results.save_dex.success"、"target.hp > 10"、"2d6+3 > 8"）
 * @param scope 变量表（如 { target, spell, state, results }）
 * @returns 求值结果（number | boolean）
 * @throws 语法错误 / 未知变量 / 空值访问 / 类型不匹配时抛错，调用方转为 failure 结果
 */
export function evaluateExpression(expr: string, scope: Record<string, unknown>, options: EvalOptions = {}): Value {
  const rollFn = options.rollFn ?? ((sides: number) => 1 + Math.floor(Math.random() * sides));
  const tokens = tokenize(expr);
  let pos = 0;

  const peek = (): Token | null => tokens[pos] ?? null;
  const eat = (type: Token['type'], value?: string): Token => {
    const t = tokens[pos];
    if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`表达式语法错误：期望 ${value ?? type}，实际 "${t?.value ?? '结束'}"（位置 ${pos}）`);
    }
    pos++;
    return t;
  };

  function truthy(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return Boolean(v);
  }

  function num(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    throw new Error(`表达式需要数值，得到 ${typeof v}`);
  }

  // precedence: || < && < 比较 < +- < */% < 一元 < 原子
  function parseOr(): Value {
    let left = parseAnd();
    while (peek()?.type === 'op' && peek()!.value === '||') {
      eat('op');
      const right = parseAnd();
      left = truthy(left) || truthy(right);
    }
    return left;
  }

  function parseAnd(): Value {
    let left = parseCompare();
    while (peek()?.type === 'op' && peek()!.value === '&&') {
      eat('op');
      const right = parseCompare();
      left = truthy(left) && truthy(right);
    }
    return left;
  }

  function parseCompare(): Value {
    const left = parseAdd();
    const t = peek();
    if (t?.type === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(t.value)) {
      eat('op');
      const right = parseAdd();
      switch (t.value) {
        case '>': return num(left) > num(right);
        case '>=': return num(left) >= num(right);
        case '<': return num(left) < num(right);
        case '<=': return num(left) <= num(right);
        case '==': return left === right;
        case '!=': return left !== right;
      }
    }
    return left;
  }

  function parseAdd(): Value {
    let left = parseMul();
    while (peek()?.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = eat('op').value;
      const right = parseMul();
      left = op === '+' ? num(left) + num(right) : num(left) - num(right);
    }
    return left;
  }

  function parseMul(): Value {
    let left = parseUnary();
    while (peek()?.type === 'op' && ['*', '/', '%'].includes(peek()!.value)) {
      const op = eat('op').value;
      const right = parseUnary();
      if ((op === '/' || op === '%') && num(right) === 0) throw new Error('表达式除零');
      left = op === '*' ? num(left) * num(right) : op === '/' ? num(left) / num(right) : num(left) % num(right);
    }
    return left;
  }

  function parseUnary(): Value {
    const t = peek();
    if (t?.type === 'op' && t.value === '-') {
      eat('op');
      return -num(parseUnary());
    }
    if (t?.type === 'op' && t.value === '!') {
      eat('op');
      return !truthy(parseUnary());
    }
    return parseAtom();
  }

  function parseAtom(): Value {
    const t = peek();
    if (!t) throw new Error('表达式意外结束');
    if (t.type === 'num') { eat('num'); return parseFloat(t.value); }
    if (t.type === 'dice') {
      eat('dice');
      const m = t.value.match(/^([0-9]+)d([0-9]+)$/i)!;
      return rollDiceExpr(parseInt(m[1], 10), parseInt(m[2], 10), rollFn);
    }
    if (t.type === 'lparen') {
      eat('lparen');
      const v = parseOr();
      eat('rparen');
      return v;
    }
    if (t.type === 'ident') {
      eat('ident');
      const name = t.value;

      // 布尔字面量
      if (name === 'true') return true;
      if (name === 'false') return false;

      // 骰式：dN（单骰）与 NdM（多骰）
      if (/^d[0-9]+$/.test(name)) {
        return rollDiceExpr(1, parseInt(name.slice(1), 10), rollFn);
      }
      const diceMatch = name.match(/^([0-9]+)d([0-9]+)$/i);
      if (diceMatch) {
        return rollDiceExpr(parseInt(diceMatch[1], 10), parseInt(diceMatch[2], 10), rollFn);
      }

      // 内置函数（只读数值函数）
      if ((BUILTIN_FNS as readonly string[]).includes(name)) {
        eat('lparen');
        const args: number[] = [num(parseOr())];
        while (peek()?.type === 'comma') {
          eat('comma');
          args.push(num(parseOr()));
        }
        eat('rparen');
        switch (name) {
          case 'min': return Math.min(...args);
          case 'max': return Math.max(...args);
          case 'floor': return Math.floor(args[0]);
          case 'ceil': return Math.ceil(args[0]);
          case 'abs': return Math.abs(args[0]);
        }
      }

      // 变量 + 成员访问链（a.b.c）
      let value: unknown = resolveIdentifier(name, scope);
      while (peek()?.type === 'dot') {
        eat('dot');
        const prop = eat('ident').value;
        value = memberAccess(value, prop);
      }
      if (typeof value === 'number' || typeof value === 'boolean') return value;
      if (value === null || value === undefined) {
        throw new Error(`表达式变量 ${name} 求值为空`);
      }
      throw new Error(`表达式需要数值或布尔，${name} 是 ${typeof value}`);
    }
    throw new Error(`表达式语法错误：意外 token "${t.value}"`);
  }

  const result = parseOr();
  if (pos < tokens.length) {
    throw new Error(`表达式有多余内容: "${tokens[pos].value}"`);
  }
  return result;
}
