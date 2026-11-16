// NPC 回合图鉴特性面板（DM 端，放映模式沙盘下方常驻区块）：
// 当前回合参战者由怪物图鉴模板派生时，展示该条目「其他信息 > 特性」版块；
// 结构化 traits 缺失时回退 features 原文，与 MonsterDetail 展示口径一致。
import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import type { NpcTemplate } from '@/types/combat';

interface Props {
  template: NpcTemplate;
}

/** 图鉴提取的条目名是中英粘连（如「俯冲攻击DiveAttack」），拆为「中文名（英文名）」展示（复刻 MonsterDetail 锚定正则） */
function splitTraitName(name: string): { zh: string; en: string } {
  const m = name.match(/^([\u4e00-\u9fff（）·]+)\s*(.*)$/);
  const zh = m ? m[1] : name;
  const en = m && m[2] ? m[2].replace(/\s+/g, ' ').trim() : '';
  return { zh, en };
}

export default function CombatantTraitPanel(props: Props) {
  const { template } = props;
  const [expanded, setExpanded] = useState(true);
  const traits = template.traits ?? [];
  const featuresText = template.features?.trim();

  return (
    <div className="rounded-xl border p-3 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2"
        title={expanded ? '收起特性' : '展开特性'}
      >
        <span className="flex items-center gap-2 text-sm font-bold dark:text-text-dark light:text-text-light">
          <BookOpen className="w-4 h-4 text-primary" />
          特性
          <span className="text-xs font-normal dark:text-text-dark-muted light:text-text-light-muted">{template.name}</span>
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {traits.length > 0 ? (
            traits.map((t, i) => {
              const { zh, en } = splitTraitName(t.name);
              return (
                <div key={i} className="text-sm dark:text-text-dark light:text-text-light">
                  <span className="font-medium">{zh}</span>
                  {en && <span className="text-xs text-gray-500 ml-1">（{en}）</span>}
                  <span className="ml-2">{t.text}</span>
                </div>
              );
            })
          ) : (
            <div className="text-sm dark:text-text-dark light:text-text-light whitespace-pre-wrap">{featuresText || '无'}</div>
          )}
        </div>
      )}
    </div>
  );
}
