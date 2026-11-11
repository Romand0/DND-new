// 玩法体系分页：容器介绍 + 选项库全貌成员（已选高亮 / 未解锁置灰 / DM 一键入卡）
import { Plus } from 'lucide-react';
import type { Character } from '@/types/character';
import { FEATURE_ROLE_META, deriveFeatureRole } from '@/data/featureRole';
import { collectSystemGroups, isMemberSelected, type SystemMember } from '@/data/systemView';

interface Props {
  character: Character;
  search: string;
  /** 角色有效等级：调用方用与顶栏展示同源的口径传入（经验推导），避免 character.level 脱节 */
  charLevel?: number;
  readOnly?: boolean;
  onAddMember?: (member: SystemMember) => void;
}

export default function FeatureSystemView(props: Props) {
  const { character, search, charLevel, readOnly, onAddMember } = props;
  const level = charLevel ?? (character.level || 1);
  const kw = search.trim().toLowerCase();
  const groups = collectSystemGroups(character).filter((g) => {
    if (!kw) return true;
    if (g.system.toLowerCase().includes(kw) || g.containerName.toLowerCase().includes(kw)) return true;
    return g.members.some(
      (m) => m.name.toLowerCase().includes(kw) || (m.description || '').toLowerCase().includes(kw)
    );
  });

  if (groups.length === 0) {
    return (
      <div className="py-4 text-center text-xs dark:text-text-dark-muted light:text-text-light-muted">
        {kw ? `没有匹配「${search.trim()}」的体系` : '当前职业暂无玩法体系'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div
          key={`${g.source}:${g.containerName}`}
          className="rounded-lg border p-3 space-y-2 dark:border-border-dark light:border-border-light"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium dark:text-text-dark light:text-text-light">{g.system}</span>
            {g.containerName !== g.system && (
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{g.containerName}</span>
            )}
            {g.level != null && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs">Lv.{g.level}</span>
            )}
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{g.source}</span>
          </div>
          {g.containerText && (
            <p className="text-xs leading-relaxed dark:text-text-dark-muted light:text-text-light-muted">{g.containerText}</p>
          )}
          <div className="space-y-1.5">
            {g.members.map((m) => {
              const selected = isMemberSelected(character.features, m);
              const unlocked = !m.level || m.level <= level;
              const role = deriveFeatureRole({ name: m.name, description: m.description, category: m.category, role: m.role });
              const meta = FEATURE_ROLE_META[role];
              return (
                <div
                  key={m.name}
                  className={`p-2 rounded-lg space-y-1 dark:bg-bg-dark light:bg-bg-light-2 ${unlocked ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm dark:text-text-dark light:text-text-light">{m.name}</span>
                    {m.level != null && (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs">Lv.{m.level}</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${meta.chip}`}>{meta.label}</span>
                    {selected && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-500">已选</span>
                    )}
                    {m.custom && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-amber-500/15 text-amber-600">手录</span>
                    )}
                    {!unlocked && (
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-500/15 text-gray-500">
                        未解锁（第{m.level}级）
                      </span>
                    )}
                    {!readOnly && !selected && onAddMember && (
                      <button
                        type="button"
                        disabled={!unlocked}
                        title={unlocked ? '加入角色卡' : `第${m.level}级解锁`}
                        onClick={() => unlocked && onAddMember(m)}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors disabled:opacity-40 dark:border-border-dark light:border-border-light hover:border-primary hover:text-primary"
                      >
                        <Plus className="w-3 h-3" />
                        加入角色卡
                      </button>
                    )}
                  </div>
                  {m.description && (
                    <p className="text-xs leading-relaxed dark:text-text-dark-muted light:text-text-light-muted">{m.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export type { SystemMember };
