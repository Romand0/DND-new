// 法术射程解析 —— flowCompiler.ts 同款数字解析 + 特殊射程识别
// 返回值语义：number = 明确的英尺射程；null = 特殊射程（触及以外无法量化，门禁放行并在 data 中记录原文）

const SPECIAL_RANGE_KEYWORDS = ['触及', '自身', '无限', '视线', '一英里', '一里', '特殊'] as const;

export interface ParsedSpellRange {
  feet: number | null;      // null = 特殊射程
  label: string;            // 展示用原文（如 "60尺" / "触及"）
  touch: boolean;           // 是否触及类（触及按 5 尺门禁）
  self: boolean;            // 「自身」类：目标恒为施法者自己，目标选择步骤可跳过
}

export function parseSpellRange(range: string | undefined): ParsedSpellRange {
  const label = (range ?? '').trim() || '未知';
  if (label.includes('触及')) return { feet: 5, label, touch: true, self: false };
  // 「自身」/「自身（10尺半径）」：以施法者为原点，目标恒自己
  if (label.includes('自身')) return { feet: null, label, touch: false, self: true };
  for (const kw of SPECIAL_RANGE_KEYWORDS) {
    if (kw !== '触及' && kw !== '自身' && label.includes(kw)) return { feet: null, label, touch: false, self: false };
  }
  const feet = parseInt(label.replace(/\D/g, ''), 10);
  return { feet: Number.isFinite(feet) && feet > 0 ? feet : null, label, touch: false, self: false };
}
