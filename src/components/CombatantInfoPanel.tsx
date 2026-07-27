import { useState } from 'react';
import { X } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import type { Combatant } from '@/types/combat';
import type { Character } from '@/types/character';

interface Props {
  combatant: Combatant;
  onClose: () => void;
}

export default function CombatantInfoPanel({ combatant, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'status' | 'actions'>('info');

  const character = combatant.characterId ? characterStore.get(combatant.characterId) : null;

  const attacks = character?.attacks || [];
  const heldLeftId = character?.heldLeft?.equipmentId;
  const heldRightId = character?.heldRight?.equipmentId;
  const heldLeftItem = heldLeftId ? character.equipment.find(e => (e.childId || e.id) === heldLeftId) : null;
  const heldRightItem = heldRightId ? character.equipment.find(e => (e.childId || e.id) === heldRightId) : null;
  const leftUsable = character ? characterStore.isWeaponUsable(character, 'left') : false;
  const rightUsable = character ? characterStore.isWeaponUsable(character, 'right') : false;

  const handleHoldSelect = (item: any, hand: 'left' | 'right') => {
    if (!character) return;
    const result = characterStore.holdItem(character.id, item.id!, hand);
    if (!result.success) alert(result.message);
  };

  const handleUnhold = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.unholdItem(character.id, hand);
  };

  const handleSetAction = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.setHandAction(character.id, hand);
  };

  const handleEndAction = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.endHandAction(character.id, hand);
  };

  const handleSetUnavailable = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.setHandUnavailable(character.id, hand);
  };

  const handleRestoreHand = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.restoreHand(character.id, hand);
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

        <div className="p-3 max-h-[40vh] overflow-y-auto">
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
                  <div className="text-xs font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">可用攻击</div>
                  <div className="space-y-1.5">
                    {attacks.map((attack) => {
                      const attackUsable = (() => {
                        const leftMatch = heldLeftItem && heldLeftItem.name === attack.name;
                        const rightMatch = heldRightItem && heldRightItem.name === attack.name;
                        return (leftMatch && leftUsable) || (rightMatch && rightUsable);
                      })();
                      return (
                        <div
                          key={attack.id}
                          className={`p-2 rounded-lg text-xs ${
                            attackUsable
                              ? 'ring-1 ring-primary/60 dark:bg-primary/5 light:bg-primary/5'
                              : 'dark:bg-bg-dark light:bg-bg-light-2'
                          }`}
                        >
                          <div className="font-medium dark:text-text-dark light:text-text-light">{attack.name}</div>
                          <div className="flex items-center gap-2 mt-1 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                            <span className="text-primary">{attack.attackBonus || '—'}</span>
                            <span>·</span>
                            <span>{attack.damage || '—'}</span>
                          </div>
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
                          <button onClick={() => setSelectingHand('left')} className="p-0.5 rounded bg-primary/10 text-primary">
                            <X className="w-3 h-3" />
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
                          <button onClick={() => setSelectingHand('right')} className="p-0.5 rounded bg-primary/10 text-primary">
                            <X className="w-3 h-3" />
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
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-bg-dark rounded-lg border dark:border-border-dark light:border-border-light p-3 w-full max-w-xs">
              <div className="text-xs font-medium mb-2">选择装备</div>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => { handleSetAction(selectingHand); setSelectingHand(null); }}
                  className="flex-1 py-1.5 text-xs rounded bg-accent/10 text-accent"
                >动作</button>
                <button
                  onClick={() => { handleSetUnavailable(selectingHand); setSelectingHand(null); }}
                  className="flex-1 py-1.5 text-xs rounded bg-danger/10 text-danger"
                >不可用</button>
              </div>
              <div className="max-h-[150px] overflow-y-auto space-y-1">
                {holdableCandidates.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleHoldItemSelect(item)}
                    className="w-full text-left p-2 text-xs rounded hover:bg-primary/10 dark:text-text-dark light:text-text-light"
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <button onClick={() => setSelectingHand(null)} className="mt-2 w-full py-1.5 text-xs rounded border dark:border-border-dark light:border-border-light">取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
