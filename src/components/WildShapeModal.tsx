// 荒野变形弹窗（德鲁伊 2 级战斗变形）：图鉴野兽模板选择 + 变身/恢复原形双模式。
// 数据源 = npcTemplateStore（怪物图鉴本地库按 creatureType==='beast' 过滤），零硬编码。
// 引擎零暗骰：变身只是参战者数据替换，资源扣减（池扣）由消费方在确认回调里结算。
import { useState } from 'react';
import { X } from 'lucide-react';
import { listWildShapeBeasts } from '@/data/wildShapeBeasts';
import type { WildShapeState } from '@/types/combat';

interface Props {
  /** 已处于野兽形态时进入还原模式（显示当前野兽与原形快照） */
  current: WildShapeState | null;
  targetName: string;
  onConfirm: (beastTemplateId: string) => void;
  onClose: () => void;
}

export default function WildShapeModal({ current, targetName, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const beasts = listWildShapeBeasts();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="wild-shape-modal">
      <div className="relative w-full max-w-md rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light">
          <h3 className="font-bold text-sm dark:text-text-dark light:text-text-light">
            {current ? '荒野变形（恢复原形）' : '荒野变形（选择野兽）'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-danger/10 text-danger transition-colors"
            data-testid="wild-shape-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {current ? (
            <div className="text-xs space-y-1 dark:text-text-dark/70 light:text-text-light/70" data-testid="wild-shape-restore-info">
              <p>
                {targetName} 当前形态：{current.beastName}（变身后 HP 独立结算，伤害溢出由 DM 手动校正）
              </p>
              <p>恢复原形：还原 {current.snapshot.name} 的 HP/AC/攻击/速度；野兽侧受伤丢弃（5e 规则：原形 HP 独立）。</p>
            </div>
          ) : (
            <>
              <p className="text-xs dark:text-text-dark/70 light:text-text-light/70">
                {targetName} 变身后参战者 HP/AC/速度/六维/攻击整体替换为野兽数据，原形数据自动快照；再次使用本特性可恢复原形。
              </p>
              <div className="space-y-2" data-testid="wild-shape-beast-list">
                {beasts.map((beast) => (
                  <button
                    key={beast.templateId}
                    onClick={() => setSelected(beast.templateId)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                      selected === beast.templateId
                        ? 'border-primary bg-primary/10'
                        : 'dark:border-border-dark dark:hover:bg-white/5 light:border-border-light light:hover:bg-black/5'
                    }`}
                    data-testid={`wild-shape-beast-${beast.templateId}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium dark:text-text-dark light:text-text-light">{beast.name}</span>
                      <span className="text-xs dark:text-text-dark/60 light:text-text-light/60">
                        CR {beast.cr ?? '?'} · AC {beast.ac} · HP {beast.maxHp} · {beast.speed ?? 0}尺
                      </span>
                    </div>
                    <div className="text-xs mt-1 dark:text-text-dark/60 light:text-text-light/60">
                      {(beast.attacks ?? [])
                        .map((a) => `${a.name} ${a.attackBonus} ${a.damage} ${a.damageType}`)
                        .join('；') || '无攻击条目'}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 p-3 border-t dark:border-border-dark light:border-border-light">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm border transition-colors dark:border-border-dark dark:text-text-dark/80 light:border-border-light light:text-text-light/80 hover:bg-black/5 dark:hover:bg-white/5"
            data-testid="wild-shape-cancel"
          >
            取消
          </button>
          <button
            onClick={() => (current ? onConfirm('') : selected != null && onConfirm(selected))}
            disabled={current ? false : selected == null}
            className="flex-1 py-2 rounded-lg text-sm bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="wild-shape-confirm"
          >
            {current ? '恢复原形' : '变身'}
          </button>
        </div>
      </div>
    </div>
  );
}
