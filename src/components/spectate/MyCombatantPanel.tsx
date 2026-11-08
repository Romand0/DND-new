// 我的参战者面板（玩家端，只读）：复刻 DM 侧 CombatantInfoPanel 的四分页结构。
// 数据全部来自观战投影（CombatRosterEntry），无任何写操作：
//   基础信息 ← 「快捷」（HP/AC/攻击列表，砍法术位与可点击射程检索）
//   状态     ← 「状态」（手持/专注/失能/死亡豁免，无能力开关）
//   背包     ← 「背包」（inventory 投影：名称/类目/数量/手持标注/攻击属性，只读）
//   操作     ← 「操作」（动作/附赠计数 + 回合待办，砍 NPC 特质与主动技能）
import { useState } from 'react';
import { Ban, Info, Moon, Skull, Sparkles, Backpack, Zap, Activity, Hand } from 'lucide-react';
import type { CombatRosterEntry, RosterInventoryItem } from '@/types/realtime';

const HAND_STATE_LABELS: Record<string, string> = {
  ready: '待用',
  action: '动作中',
  unavailable: '不可用',
};

type TabKey = 'info' | 'status' | 'inventory' | 'actions';

const TABS: { key: TabKey; label: string; icon: typeof Info }[] = [
  { key: 'info', label: '基础信息', icon: Info },
  { key: 'status', label: '状态', icon: Activity },
  { key: 'inventory', label: '背包', icon: Backpack },
  { key: 'actions', label: '操作', icon: Zap },
];

export function MyCombatantsSection({
  roster,
  myCharacterIds,
  playback,
}: {
  roster: CombatRosterEntry[];
  myCharacterIds: Set<string>;
  playback: boolean;
}) {
  const mine = roster.filter((c) => c.characterId && myCharacterIds.has(c.characterId));
  if (mine.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold dark:text-text-dark light:text-text-light px-1">我的参战者</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mine.map((c) => (
          <MyCombatantPanel key={c.id} c={c} playback={playback} />
        ))}
      </div>
    </div>
  );
}

export function MyCombatantPanel({ c, playback }: { c: CombatRosterEntry; playback: boolean }) {
  const [tab, setTab] = useState<TabKey>('info');
  const hpRatio = c.maxHp > 0 ? Math.max(0, Math.min(1, (c.hp + c.tempHp) / c.maxHp)) : 0;

  return (
    <div
      className={`p-4 rounded-xl border space-y-3 transition-all dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light ${
        c.dead ? 'opacity-50' : ''
      }`}
    >
      {/* 卡片头（常驻）：身份牌 + HP 条 + 状态徽标 */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate dark:text-text-dark light:text-text-light">{c.name}</span>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary shrink-0">
          先攻 {c.initiative}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-mono font-bold dark:text-text-dark light:text-text-light">
            {c.hp}
            {c.tempHp > 0 && <span className="text-amber-500"> +{c.tempHp}</span>}
            <span className="dark:text-text-dark-muted light:text-text-light-muted"> / {c.maxHp}</span>
          </span>
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">AC {c.ac ?? '—'}</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-500/20 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              c.dead ? 'bg-neutral-500' : hpRatio > 0.5 ? 'bg-emerald-500' : hpRatio > 0.25 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${hpRatio * 100}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap min-h-6">
        {c.dead && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-neutral-600/20 text-neutral-400">
            <Skull className="w-3 h-3" /> 死亡
          </span>
        )}
        {!c.dead && c.downed && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-600/15 text-red-500">
            <Moon className="w-3 h-3" /> 昏迷
          </span>
        )}
        {c.incapacitated && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-600/15 text-orange-500">
            <Ban className="w-3 h-3" /> 失能
          </span>
        )}
        {c.concentrating && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-violet-600/15 text-violet-500">
            <Sparkles className="w-3 h-3" /> 专注
          </span>
        )}
        {!c.dead && !c.downed && !c.incapacitated && !c.concentrating && (
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">状态正常</span>
        )}
      </div>

      {/* 分页 */}
      <div className="flex gap-1 rounded-lg p-1 dark:bg-bg-dark light:bg-bg-light-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
              tab === key
                ? 'bg-primary/15 text-primary font-medium'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-white/5'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="text-xs">
        {tab === 'info' && <InfoTab c={c} />}
        {tab === 'status' && <StatusTab c={c} />}
        {tab === 'inventory' && <InventoryTab c={c} />}
        {tab === 'actions' && <ActionsTab c={c} playback={playback} />}
      </div>
    </div>
  );
}

/** 基础信息：攻击列表（名称/伤害/类型/属性/射程）——对应 DM「快捷」的攻击区块（只读） */
function InfoTab({ c }: { c: CombatRosterEntry }) {
  const attacks = (c.inventory ?? []).filter((i) => i.attack);
  if (attacks.length === 0) {
    return <p className="dark:text-text-dark-muted light:text-text-light-muted">暂无攻击方式</p>;
  }
  return (
    <div className="space-y-1.5">
      {attacks.map((item) => {
        const atk = item.attack!;
        const held =
          c.heldLeft?.name === item.name ? '左手' : c.heldRight?.name === item.name ? '右手' : null;
        return (
          <div key={item.childId} className="rounded-lg px-2.5 py-1.5 space-y-0.5 dark:bg-bg-dark light:bg-bg-light-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium dark:text-text-dark light:text-text-light">{item.name}</span>
              <span className="shrink-0 font-mono dark:text-text-dark-muted light:text-text-light-muted">
                {atk.damage} {atk.damageType}
                {held && <span className="ml-1 text-emerald-500">（{held}）</span>}
              </span>
            </div>
            <div className="dark:text-text-dark-muted light:text-text-light-muted">
              {atk.normalRange ? `射程 ${atk.normalRange}/${atk.maxRange ?? atk.normalRange} 尺` : '近战'}
              {atk.properties.length > 0 ? ` · ${atk.properties.join('、')}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 状态：手持两卡 + 专注 + 失能 + 死亡豁免——对应 DM「状态」（无能力开关，只读） */
function StatusTab({ c }: { c: CombatRosterEntry }) {
  const hasAny =
    c.heldLeft || c.heldRight || c.concentrating || c.incapacitated || c.deathSaves;
  if (!hasAny) {
    return <p className="dark:text-text-dark-muted light:text-text-light-muted">当前无状态效果</p>;
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(['left', 'right'] as const).map((side) => {
          const hand = side === 'left' ? c.heldLeft : c.heldRight;
          return (
            <div key={side} className="rounded-lg px-2 py-1.5 dark:bg-bg-dark light:bg-bg-light-2">
              <div className="dark:text-text-dark-muted light:text-text-light-muted">
                {side === 'left' ? '左手' : '右手'}
              </div>
              {hand ? (
                <div className="font-medium dark:text-text-dark light:text-text-light">
                  {hand.name}
                  <span className="ml-1 dark:text-text-dark-muted light:text-text-light-muted">
                    （{HAND_STATE_LABELS[hand.state] ?? hand.state}）
                  </span>
                </div>
              ) : (
                <div className="dark:text-text-dark-muted light:text-text-light-muted">空手</div>
              )}
            </div>
          );
        })}
      </div>

      {c.concentrating && (
        <div className="rounded-lg px-2.5 py-1.5 space-y-0.5 bg-violet-600/10">
          <div className="flex items-center gap-1.5 font-medium text-violet-500">
            <Sparkles className="w-3.5 h-3.5" />
            专注：{c.concentration.spellName}
          </div>
          <div className="dark:text-text-dark-muted light:text-text-light-muted">
            自第 {c.concentration.startedRound + 1} 轮开始维持；受伤害需体质豁免（DC = max(10, 伤害一半)）
          </div>
        </div>
      )}

      {c.incapacitated && (
        <div className="rounded-lg px-2.5 py-1.5 space-y-0.5 bg-orange-600/10">
          <div className="flex items-center gap-1.5 font-medium text-orange-500">
            <Ban className="w-3.5 h-3.5" />
            失能
          </div>
          <div className="dark:text-text-dark-muted light:text-text-light-muted">
            无法行动、无法专注、无法说话、先攻投掷劣势
          </div>
        </div>
      )}

      {c.deathSaves && (
        <div className="rounded-lg px-2.5 py-1.5 space-y-1 bg-red-600/10">
          <div className="flex items-center gap-1.5 font-medium text-red-500">
            <Skull className="w-3.5 h-3.5" />
            死亡豁免
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">失败</span>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${i < (c.deathSaves?.failures ?? 0) ? 'bg-red-500' : 'bg-neutral-500/30'}`}
                />
              ))}
            </span>
            <span className="flex items-center gap-1">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">成功</span>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${i < (c.deathSaves?.successes ?? 0) ? 'bg-emerald-500' : 'bg-neutral-500/30'}`}
                />
              ))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 背包：inventory 投影只读列表（名称/类目/数量/手持标注/攻击属性副行） */
function InventoryTab({ c }: { c: CombatRosterEntry }) {
  const items = c.inventory ?? [];
  if (items.length === 0) {
    return <p className="dark:text-text-dark-muted light:text-text-light-muted">战斗背包为空</p>;
  }
  const heldNames = new Set([c.heldLeft?.name, c.heldRight?.name].filter(Boolean) as string[]);
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <InventoryRow key={item.childId} item={item} held={heldNames.has(item.name)} />
      ))}
    </div>
  );
}

function InventoryRow({ item, held }: { item: RosterInventoryItem; held: boolean }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5 dark:bg-bg-dark light:bg-bg-light-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate dark:text-text-dark light:text-text-light">
          {item.name}
          {item.quantity > 1 && <span className="ml-1 text-primary">×{item.quantity}</span>}
        </span>
        <span className="shrink-0 flex gap-1">
          {held && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
              <Hand className="w-3 h-3" /> 手持
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-neutral-500/10 dark:text-text-dark-muted light:text-text-light-muted">
            {item.category || '杂项'}
          </span>
        </span>
      </div>
      {item.attack && (
        <div className="mt-0.5 dark:text-text-dark-muted light:text-text-light-muted">
          {item.attack.damage} {item.attack.damageType}
          {item.attack.properties.length > 0 ? ` · ${item.attack.properties.join('、')}` : ''}
        </div>
      )}
    </div>
  );
}

/** 操作：动作/附赠计数 + 我的回合待办——对应 DM「操作」（只读，砍 NPC 特质与主动技能） */
function ActionsTab({ c, playback }: { c: CombatRosterEntry; playback: boolean }) {
  return (
    <div className="space-y-2">
      {playback && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg px-2.5 py-1.5 dark:bg-bg-dark light:bg-bg-light-2">
            <div className="dark:text-text-dark-muted light:text-text-light-muted">主动作</div>
            <div className="text-base font-bold font-mono dark:text-text-dark light:text-text-light">
              {c.actions ?? 0}
            </div>
          </div>
          <div className="rounded-lg px-2.5 py-1.5 dark:bg-bg-dark light:bg-bg-light-2">
            <div className="dark:text-text-dark-muted light:text-text-light-muted">附赠动作</div>
            <div className="text-base font-bold font-mono dark:text-text-dark light:text-text-light">
              {c.bonusActions ?? 0}
            </div>
          </div>
        </div>
      )}
      <div>
        <div className="font-medium mb-1 dark:text-text-dark light:text-text-light">我的回合待办</div>
        {(c.todos ?? []).length === 0 ? (
          <p className="dark:text-text-dark-muted light:text-text-light-muted">暂无持续效果待办</p>
        ) : (
          <div className="space-y-1">
            {(c.todos ?? []).map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 dark:bg-bg-dark light:bg-bg-light-2"
              >
                <span className="truncate dark:text-text-dark light:text-text-light">{t.name}</span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded ${
                    t.executed
                      ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-600/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {t.typeLabel} · {t.executed ? '已处理' : '待处理'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
