// 骰子表达式解析 —— 唯一事实源
// 支持 "8d6" / "2d8+3" / "12"（flat）；SpellEffectStep 与 flowCompiler 共用。

export interface ParsedDice {
  count: number;   // 骰子个数（flat 表达式为 0）
  sides: number;   // 骰面数（flat 表达式为 0）
  bonus: number;   // 固定加值（含 flat 数值）
}

export function parseDice(expr: string): ParsedDice {
  const result: ParsedDice = { count: 1, sides: 0, bonus: 0 };
  if (!expr) return result;
  const plusIdx = expr.indexOf('+');
  let dicePart = expr;
  let bonusPart = '';
  if (plusIdx !== -1) {
    dicePart = expr.substring(0, plusIdx).trim();
    bonusPart = expr.substring(plusIdx + 1).trim();
  } else {
    dicePart = expr.trim();
  }
  if (bonusPart) {
    const b = parseInt(bonusPart, 10);
    if (!isNaN(b)) result.bonus = b;
  }
  const dIdx = dicePart.toLowerCase().indexOf('d');
  if (dIdx === -1) {
    const flat = parseInt(dicePart, 10);
    if (!isNaN(flat)) {
      result.bonus += flat;
      result.count = 0;
    }
    return result;
  }
  const countStr = dicePart.substring(0, dIdx).trim();
  const sidesStr = dicePart.substring(dIdx + 1).trim();
  if (countStr) {
    const c = parseInt(countStr, 10);
    if (!isNaN(c) && c > 0) result.count = c;
  }
  if (sidesStr) {
    const s = parseInt(sidesStr, 10);
    if (!isNaN(s) && s > 0) result.sides = s;
  }
  return result;
}
