// 怪物图鉴卡片（移动端 + 通用）：为 DM 快速扫描设计
// 关键信息优先级：CR（危险度色阶锚点）> 名称/种类 > 生命三要素（AC/HP/速度）> 主攻击伤害
// 交互：整卡点击进入详情；来源与英文别名以弱化文本收尾
import { useNavigate } from 'react-router-dom';
import { Shield, Heart, Footprints, Swords } from 'lucide-react';
import type { NpcTemplate } from '@/types/combat';
import { CREATURE_SIZE_LABELS, CREATURE_TYPE_LABELS, crToNumber, normalizeCr } from '@/types/combat';

interface MonsterCardProps {
  template: NpcTemplate;
}

/** CR 危险度色阶：DM 扫一眼即可感知威胁档位（官方图鉴的色带直觉） */
function crTier(cr: string | undefined): { chip: string; text: string } {
  const canon = normalizeCr(cr);
  if (canon === null) return { chip: 'bg-gray-500/15', text: 'text-gray-400' };
  const n = crToNumber(canon);
  if (n <= 1) return { chip: 'bg-emerald-500/15', text: 'text-emerald-400' };
  if (n <= 4) return { chip: 'bg-amber-500/15', text: 'text-amber-400' };
  if (n <= 9) return { chip: 'bg-orange-500/15', text: 'text-orange-400' };
  if (n <= 16) return { chip: 'bg-red-500/15', text: 'text-red-400' };
  return { chip: 'bg-fuchsia-500/15', text: 'text-fuchsia-400' };
}

export default function MonsterCard({ template }: MonsterCardProps) {
  const navigate = useNavigate();
  const tier = crTier(template.cr);
  const crCanon = normalizeCr(template.cr);

  const size = template.creatureSize !== undefined ? CREATURE_SIZE_LABELS[template.creatureSize] : template.size;
  const type = template.creatureType !== undefined ? CREATURE_TYPE_LABELS[template.creatureType] : template.type;
  const primaryAttacks = (template.attacks ?? []).filter(a => a.damage).slice(0, 2);
  const moreCount = (template.attacks ?? []).length - primaryAttacks.length;

  return (
    <button
      onClick={() => navigate(`/monsters/${template.id}`)}
      className="w-full text-left rounded-xl border dark:bg-card-dark light:bg-card-light dark:border-border-dark light:border-border-light p-3.5 hover:border-primary/50 hover:shadow-md transition-all"
    >
      {/* 头部：CR 色阶徽标 + 名称 + 种类/体型 */}
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-12 rounded-lg px-1 py-1.5 text-center ${tier.chip}`} title={`挑战等级 ${crCanon ?? '未知'}`}>
          <div className="text-[9px] leading-none opacity-70 dark:text-text-dark-muted light:text-text-light-muted">CR</div>
          <div className={`text-base font-bold leading-tight ${tier.text}`}>
            {crCanon ?? '—'}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[15px] dark:text-text-dark light:text-text-light truncate">
              {template.name}
            </span>
            {template.nameEn && (
              <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted truncate">
                {template.nameEn}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {size && (
              <span className="text-[10px] px-1.5 py-0.5 rounded dark:bg-white/10 light:bg-black/5 dark:text-text-dark-muted light:text-text-light-muted">
                {size}
              </span>
            )}
            {type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {type}
              </span>
            )}
            {template.alignment && (
              <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                {template.alignment}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 生命三要素：AC / HP / 速度 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { icon: Shield, label: 'AC', value: template.ac ?? '—' },
          { icon: Heart, label: 'HP', value: template.maxHp ?? '—' },
          { icon: Footprints, label: '速度', value: template.speed != null ? `${template.speed}尺` : '—' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 dark:bg-white/5 light:bg-black/5">
            <Icon className="w-3.5 h-3.5 shrink-0 dark:text-text-dark-muted light:text-text-light-muted" />
            <div className="min-w-0">
              <div className="text-[9px] leading-none dark:text-text-dark-muted light:text-text-light-muted">{label}</div>
              <div className="text-xs font-medium leading-tight dark:text-text-dark light:text-text-light truncate">
                {value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 主攻击（带伤害，最多 2 条） */}
      {primaryAttacks.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {primaryAttacks.map((a, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
              <Swords className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="truncate">
                <span className="dark:text-text-dark light:text-text-light">{a.name}</span>
                {a.attackBonus ? ` ${a.attackBonus}` : ''}
                {a.damage ? ` · ${a.damage}${a.damageType ? ` ${a.damageType}` : ''}` : ''}
                {a.normalRange && a.maxRange && a.maxRange > a.normalRange ? ` · ${a.normalRange}/${a.maxRange}尺` : ''}
              </span>
            </div>
          ))}
          {moreCount > 0 && (
            <div className="text-[10px] pl-[18px] dark:text-text-dark-muted light:text-text-light-muted opacity-60">
              还有 {moreCount} 项攻击/能力
            </div>
          )}
        </div>
      )}

      {/* 来源 */}
      {template.source && (
        <div className="mt-2 text-[10px] dark:text-text-dark-muted light:text-text-light-muted opacity-60 text-right">
          {template.source}
        </div>
      )}
    </button>
  );
}
