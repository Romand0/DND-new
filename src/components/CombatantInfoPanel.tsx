import { useState, useEffect } from 'react';
import { X, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import type { Combatant } from '@/types/combat';
import type { Character, Attack } from '@/types/character';

interface Props {
  combatant: Combatant;
  onClose: () => void;
  combatants?: Combatant[];
  tokenMap?: { get: (id: string) => { col: number; row: number } | undefined };
}

export default function CombatantInfoPanel({ combatant, onClose, combatants = [], tokenMap }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'status' | 'actions'>('info');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAttackId, setSelectedAttackId] = useState<string | null>(null);
  const [expandedRangeAttackId, setExpandedRangeAttackId] = useState<string | null>(null);

  const character = combatant.characterId ? characterStore.get(combatant.characterId) : null;

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const attacks = character?.attacks || [];
  const heldLeftId = character?.heldLeft?.equipmentId;
  const heldRightId = character?.heldRight?.equipmentId;
  const heldLeftItem = heldLeftId ? character.equipment.find(e => (e.childId || e.id) === heldLeftId) : null;
  const heldRightItem = heldRightId ? character.equipment.find(e => (e.childId || e.id) === heldRightId) : null;
  const leftUsable = character ? characterStore.isWeaponUsable(character, 'left') : false;
  const rightUsable = character ? characterStore.isWeaponUsable(character, 'right') : false;

  const handleHoldSelect = (item: any, hand: 'left' | 'right') => {
    if (!character) return;
    const result = characterStore.holdItem(character.id, (item.childId || item.id)!, hand);
    if (!result.success) alert(result.message);
    setRefreshKey(k => k + 1);
  };

  const handleUnhold = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.unholdItem(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleSetAction = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.setHandAction(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleEndAction = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.endHandAction(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleSetUnavailable = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.setHandUnavailable(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleRestoreHand = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.restoreHand(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const [selectingHand, setSelectingHand] = useState<'left' | 'right' | null>(null);
  const holdableCandidates = character?.equipment.filter(item => {
    const slotId = item.childId || item.id;
    if (character.wornArmorId === slotId) return false;
    if (character.wornOutfitId === slotId) return false;
    return true;
  }) || [];

  const handleHoldItemSelect = (item: any) => {
    if (!selectingHand) return;
    handleHoldSelect(item, selectingHand);
    setSelectingHand(null);
  };

  const hpPercent = combatant.maxHp && combatant.maxHp > 0
    ? Math.max(0, (combatant.currentHp || 0) / combatant.maxHp * 100)
    : 0;

  const getHpColor = () => {
    if (hpPercent > 50) return 'bg-green-500';
    if (hpPercent > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const isAttackUsable = (attack: Attack): boolean => {
    const leftMatch = heldLeftItem && heldLeftItem.name === attack.name;
    const rightMatch = heldRightItem && heldRightItem.name === attack.name;
    return (leftMatch && leftUsable) || (rightMatch && rightUsable);
  };

  const isRangedWeapon = (attack: Attack): boolean => {
    // 优先检查子分类
    if (attack.subtype) {
      if (attack.subtype.includes('远程') || attack.subtype.includes('弹药')) return true;
    }
    // 再检查常规/最大射程字段（有这两个字段的武器视为远程）
    if (attack.normalRange !== undefined && attack.normalRange > 0) return true;
    if (attack.maxRange !== undefined && attack.maxRange > 0) return true;
    return false;
  };

  const isThrownWeapon = (attack: Attack): boolean => {
    // 优先检查子分类
    if (attack.subtype && attack.subtype.includes('投掷')) return true;
    // 再检查属性
    if (attack.properties) {
      return attack.properties.some(p => p.includes('投掷'));
    }
    return false;
  };

  const hasMultipleRanges = (attack: Attack): boolean => {
    const meleeRange = attack.range && !attack.range.startsWith('-');
    const hasNormal = attack.normalRange !== undefined && attack.normalRange > 0;
    const hasMax = attack.maxRange !== undefined && attack.maxRange > 0;
    let count = 0;
    if (meleeRange && (!isRangedWeapon(attack) || isThrownWeapon(attack))) count++;
    if (hasNormal) count++;
    if (hasMax) count++;
    return count > 1;
  };

  const getRangeInfo = (attack: Attack): { label: string; value: string; feet: number }[] => {
    const ranges: { label: string; value: string; feet: number }[] = [];
    const meleeRange = attack.range;
    const hasNormal = attack.normalRange !== undefined && attack.normalRange > 0;
    const hasMax = attack.maxRange !== undefined && attack.maxRange > 0;
    const isRanged = isRangedWeapon(attack);
    const isThrown = isThrownWeapon(attack);

    if (meleeRange && !meleeRange.startsWith('-') && (!isRanged || isThrown)) {
      const meleeMatch = meleeRange.match(/(\d+)/);
      const meleeFeet = meleeMatch ? parseInt(meleeMatch[1], 10) : 5;
      ranges.push({ label: '近战', value: meleeRange, feet: meleeFeet });
    }
    if (hasNormal) {
      ranges.push({ label: '常规', value: `${attack.normalRange}尺`, feet: attack.normalRange });
    }
    if (hasMax) {
      ranges.push({ label: '最大', value: `${attack.maxRange}尺`, feet: attack.maxRange });
    }
    return ranges;
  };

  const handleAttackSelect = (attackId: string) => {
    setSelectedAttackId(prev => prev === attackId ? null : attackId);
    if (selectedAttackId === attackId) {
      setExpandedRangeAttackId(null);
      setSelectedRangeIndex(null);
    } else {
      setExpandedRangeAttackId(attackId);
      setSelectedRangeIndex(null);
    }
  };

  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number | null>(null);

  const getNPCsInRange = (attack: Attack, rangeIndex: number | null = null): Combatant[] => {
    if (!tokenMap || !combatant.id) return [];
    const attackerPos = tokenMap.get(combatant.id);
    if (!attackerPos) return [];

    const rangeInfo = getRangeInfo(attack);
    let maxRangeFeet: number;
    
    if (rangeIndex !== null && rangeIndex < rangeInfo.length) {
      maxRangeFeet = rangeInfo[rangeIndex].feet;
    } else {
      maxRangeFeet = rangeInfo.length > 0 ? rangeInfo[rangeInfo.length - 1].feet : 5;
    }
    
    const maxRangeCells = Math.max(1, Math.floor(maxRangeFeet / 5));

    return combatants.filter(c => {
      if (c.id === combatant.id) return false;
      if (c.isPc) return false;
      const pos = tokenMap.get(c.id);
      if (!pos) return false;
      const distance = Math.max(Math.abs(pos.col - attackerPos.col), Math.abs(pos.row - attackerPos.row));
      return distance <= maxRangeCells;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light">
          <h3 className="font-bold text-sm dark:text-text-dark light:text-text-light">
            {combatant.name}
            {combatant.isPc && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-info/20 text-info">PC</span>}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-danger/10 text-danger transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b dark:border-border-dark light:border-border-light">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'info'
                ? 'border-b-2 border-primary text-primary'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
            }`}
          >
            信息
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'status'
                ? 'border-b-2 border-primary text-primary'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
            }`}
          >
            状态
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'actions'
                ? 'border-b-2 border-primary text-primary'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
            }`}
          >
            操作
          </button>
        </div>

        <div className="p-3 max-h-[50vh] overflow-y-auto">
          {activeTab === 'info' && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">HP</span>
                  <span className="dark:text-text-dark light:text-text-light">
                    {combatant.currentHp || 0} / {combatant.maxHp || 0}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full ${getHpColor()} transition-all`}
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
              </div>

              {combatant.tempHp !== undefined && combatant.tempHp > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">临时 HP</span>
                  <span className="text-accent font-medium">{combatant.tempHp}</span>
                </div>
              )}

              <div className="flex justify-between text-xs">
                <span className="dark:text-text-dark-muted light:text-text-light-muted">AC</span>
                <span className="font-medium dark:text-text-dark light:text-text-light">{combatant.ac || '—'}</span>
              </div>

              {attacks.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">攻击</div>
                  <div className="space-y-1.5">
                    {attacks.map((attack) => {
                      const usable = isAttackUsable(attack);
                      const selected = selectedAttackId === attack.id;
                      const hasMultiRange = hasMultipleRanges(attack);
                      const expanded = expandedRangeAttackId === attack.id;
                      const rangeInfo = getRangeInfo(attack);
                      const currentRangeIdx = selected ? selectedRangeIndex : null;
                      const npcsInRange = selected ? getNPCsInRange(attack, currentRangeIdx) : [];

                      return (
                        <div key={attack.id}>
                          <button
                            onClick={() => handleAttackSelect(attack.id!)}
                            className={`w-full text-left p-2 rounded-lg text-xs transition-all ${
                              selected
                                ? 'ring-2 ring-primary dark:bg-primary/10 light:bg-primary/10'
                                : usable
                                ? 'dark:bg-bg-dark light:bg-bg-light-2'
                                : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted/60 light:text-text-light-muted/60 opacity-60'
                            }`}
                          >
                            <div className="font-medium truncate flex items-center gap-2">
                              {attack.name}
                              {hasMultiRange && (
                                <span className="flex-shrink-0">
                                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={usable ? 'text-primary' : 'dark:text-text-dark-muted/60 light:text-text-light-muted/60'}>{attack.attackBonus || '—'}</span>
                              <span>·</span>
                              <span>{attack.damage || '—'}</span>
                            </div>
                            {!hasMultiRange && rangeInfo.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {rangeInfo.map((r, idx) => (
                                  <span key={idx} className="text-xs px-1.5 py-0.5 rounded bg-info/10 text-info">
                                    {r.label}: {r.value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>

                          {selected && hasMultiRange && (
                            <div className="ml-2 mt-1 p-2 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                              <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-2">射程信息</div>
                              <div className="flex flex-wrap gap-2">
                                {rangeInfo.map((r, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setSelectedRangeIndex(idx)}
                                    className={`text-xs px-2 py-1 rounded transition-colors ${
                                      currentRangeIdx === idx
                                        ? 'bg-info text-white'
                                        : 'bg-info/10 text-info hover:bg-info/20'
                                    }`}
                                  >
                                    {r.label}: {r.value}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {selected && npcsInRange.length > 0 && (
                            <div className="ml-2 mt-1 p-2 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                              <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-2">射程内目标</div>
                              <div className="flex flex-wrap gap-1">
                                {npcsInRange.map(npc => (
                                  <div key={npc.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded dark:bg-danger/10 light:bg-danger/5 text-danger">
                                    <span className="w-3 h-3 rounded-full bg-danger" />
                                    <span>{npc.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!character && (
                <div className="text-xs text-center py-4 dark:text-text-dark-muted light:text-text-light-muted">
                  非玩家角色，仅显示基础信息
                </div>
              )}
            </div>
          )}

          {activeTab === 'status' && character && (
            <div className="space-y-3">
              <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">手持状态</div>
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const slot = character.heldLeft;
                  const isUnavailable = slot.state === 'unavailable';
                  const isAction = slot.state === 'action';
                  const isReady = slot.state === 'ready';
                  const usable = leftUsable;
                  const twoHanded = heldLeftItem && characterStore.isTwoHandedWeapon(heldLeftItem);
                  return (
                    <div className={`rounded-lg border p-2 ${
                      isUnavailable ? 'border-danger/40 bg-danger/5'
                        : isAction ? 'border-accent/40 bg-accent/5'
                        : 'dark:border-border-dark light:border-border-light'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">左手</span>
                        {isUnavailable ? (
                          <button onClick={() => handleRestoreHand('left')} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">恢复</button>
                        ) : isAction ? (
                          <button onClick={() => handleEndAction('left')} className="px-1.5 py-0.5 text-xs rounded bg-accent/10 text-accent">结束</button>
                        ) : heldLeftItem ? (
                          <button onClick={() => handleUnhold('left')} className="px-1.5 py-0.5 text-xs rounded bg-danger/10 text-danger">放下</button>
                        ) : isReady && (
                          <button onClick={() => setSelectingHand('left')} className="p-0.5 rounded bg-primary/10 text-primary" title="拿取装备">
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {isUnavailable ? (
                        <div className="text-xs text-danger">不可用</div>
                      ) : isAction ? (
                        <div className="text-xs text-accent">动作中</div>
                      ) : heldLeftItem ? (
                        <>
                          <div className="text-xs font-medium dark:text-text-dark light:text-text-light">{heldLeftItem.name}</div>
                          {twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">双手可用</span>}
                          {twoHanded && !usable && <span className="text-xs px-1 py-0.5 rounded bg-warning/20 text-warning">仅拿持</span>}
                          {!twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">可用</span>}
                        </>
                      ) : (
                        <div className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">待用</div>
                      )}
                    </div>
                  );
                })()}

                {(() => {
                  const slot = character.heldRight;
                  const isUnavailable = slot.state === 'unavailable';
                  const isAction = slot.state === 'action';
                  const isReady = slot.state === 'ready';
                  const usable = rightUsable;
                  const twoHanded = heldRightItem && characterStore.isTwoHandedWeapon(heldRightItem);
                  return (
                    <div className={`rounded-lg border p-2 ${
                      isUnavailable ? 'border-danger/40 bg-danger/5'
                        : isAction ? 'border-accent/40 bg-accent/5'
                        : 'dark:border-border-dark light:border-border-light'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">右手</span>
                        {isUnavailable ? (
                          <button onClick={() => handleRestoreHand('right')} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">恢复</button>
                        ) : isAction ? (
                          <button onClick={() => handleEndAction('right')} className="px-1.5 py-0.5 text-xs rounded bg-accent/10 text-accent">结束</button>
                        ) : heldRightItem ? (
                          <button onClick={() => handleUnhold('right')} className="px-1.5 py-0.5 text-xs rounded bg-danger/10 text-danger">放下</button>
                        ) : isReady && (
                          <button onClick={() => setSelectingHand('right')} className="p-0.5 rounded bg-primary/10 text-primary" title="拿取装备">
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {isUnavailable ? (
                        <div className="text-xs text-danger">不可用</div>
                      ) : isAction ? (
                        <div className="text-xs text-accent">动作中</div>
                      ) : heldRightItem ? (
                        <>
                          <div className="text-xs font-medium dark:text-text-dark light:text-text-light">{heldRightItem.name}</div>
                          {twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">双手可用</span>}
                          {twoHanded && !usable && <span className="text-xs px-1 py-0.5 rounded bg-warning/20 text-warning">仅拿持</span>}
                          {!twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">可用</span>}
                        </>
                      ) : (
                        <div className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">待用</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'status' && !character && (
            <div className="text-xs text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
              非玩家角色，无详细状态
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="text-xs text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
              暂无操作
            </div>
          )}
        </div>

        {selectingHand && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectingHand(null)}>
            <div className="bg-white dark:bg-bg-dark rounded-lg border dark:border-border-dark light:border-border-light p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="text-sm font-medium mb-3">选择装备</div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { handleSetAction(selectingHand); setSelectingHand(null); }}
                  className="flex-1 py-2 text-xs rounded bg-accent/10 text-accent hover:bg-accent/20"
                >动作</button>
                <button
                  onClick={() => { handleSetUnavailable(selectingHand); setSelectingHand(null); }}
                  className="flex-1 py-2 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20"
                >不可用</button>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {holdableCandidates.map(item => (
                  <button
                    key={item.childId || item.id}
                    onClick={() => handleHoldItemSelect(item)}
                    className="w-full text-left p-2.5 text-sm rounded hover:bg-primary/10 dark:text-text-dark light:text-text-light"
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
