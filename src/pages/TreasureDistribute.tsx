import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Coins,
  Users,
  Gem,
  ArrowRight,
  Check,
  X,
  Package,
  AlertCircle,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import type {
  Treasure,
  TreasureItem,
  TreasureCurrency,
  TreasurePrice,
  DistributionRecord,
} from '@/types/treasure';
import type { Character, Equipment } from '@/types/character';
import treasureStore from '@/data/treasureStore';
import { characterStore } from '@/data/characterStore';
import { sortInventory } from '@/data/combatStore';

/* ─── 类型 ─── */

type CurrencyKey = 'pp' | 'gp' | 'ep' | 'sp' | 'cp';

interface DistributionItem {
  id: string; // 宝藏中的 item.id
  name: string;
  quantity: number;
  unitPrice?: TreasurePrice;
  /** 动画 key（每次分配新物品生成 UUID，确保滑入动画播放） */
  animKey?: string;
}

interface CharacterDistribution {
  characterId: string;
  characterName: string;
  currency: TreasureCurrency;
  items: DistributionItem[];
  experience: number;
}

/* ─── 常量 ─── */

const CURRENCY_META: { key: CurrencyKey; label: string; color: string }[] = [
  { key: 'pp', label: 'PP', color: 'text-amber-300 bg-amber-900/20 border-amber-700/30' },
  { key: 'gp', label: 'GP', color: 'text-yellow-300 bg-yellow-900/20 border-yellow-700/30' },
  { key: 'ep', label: 'EP', color: 'text-gray-400 bg-gray-700/40 border-gray-500/30' },
  { key: 'sp', label: 'SP', color: 'text-gray-300 bg-gray-800/40 border-gray-600/30' },
  { key: 'cp', label: 'CP', color: 'text-orange-300 bg-orange-900/20 border-orange-700/30' },
];

/* ─── 辅助函数 ─── */

function formatCurrencyShort(c: TreasureCurrency): string {
  const parts: string[] = [];
  if (c.pp > 0) parts.push(`${c.pp}pp`);
  if (c.gp > 0) parts.push(`${c.gp}gp`);
  if (c.ep > 0) parts.push(`${c.ep}ep`);
  if (c.sp > 0) parts.push(`${c.sp}sp`);
  if (c.cp > 0) parts.push(`${c.cp}cp`);
  return parts.length > 0 ? parts.join(' ') : '0';
}

function treasureCurrencyToCharacter(c: TreasureCurrency) {
  return {
    cp: c.cp,
    sp: c.sp,
    gp: c.gp,
    pp: c.pp,
  };
}

/** 宝藏物品单价 → 角色装备价格（装备价格已原生支持 pp/gp/sp/cp，直接透传） */
function treasurePriceToEquipmentPrice(p: TreasurePrice): { amount: number; unit: 'pp' | 'gp' | 'ep' | 'sp' | 'cp' } {
  return { amount: p.amount, unit: p.unit };
}

/* ─── 主组件 ─── */

export default function TreasureDistribute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [treasure, setTreasure] = useState<Treasure | null>(null);
  const [remainingItems, setRemainingItems] = useState<TreasureItem[]>([]);
  const [remainingCurrency, setRemainingCurrency] = useState<TreasureCurrency>({
    pp: 0, gp: 0, ep: 0, sp: 0, cp: 0,
  });
  const [remainingXp, setRemainingXp] = useState(0);
  const [selectedXp, setSelectedXp] = useState(false);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCurrencyKey, setSelectedCurrencyKey] = useState<CurrencyKey | null>(null);
  /** 长按数量选择后记录的待分配数量（仅物品卡生效；undefined=全量，数字=部分） */
  const [selectedQty, setSelectedQty] = useState<number | undefined>(undefined);

  const [distributions, setDistributions] = useState<CharacterDistribution[]>([]);

  /** 角色分配卡片 DOM ref 映射（触发脉冲动画） */
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 角色选择弹窗
  const [showCharPicker, setShowCharPicker] = useState(false);

  // 长按 / 滑动游标
  const [sliderData, setSliderData] = useState<{
    itemId: string;
    max: number;
    current: number;
    name: string;
  } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  // 确认弹窗
  const [showConfirm, setShowConfirm] = useState(false);

  // 加载宝藏
  useEffect(() => {
    if (!id) return;
    const t = treasureStore.get(id);
    if (!t) {
      navigate('/inventory/treasures');
      return;
    }
    setTreasure(t);
    setRemainingItems(t.items.map((it) => ({ ...it })));
    setRemainingCurrency({ ...t.currency });
    setRemainingXp(t.experience ?? 0);
  }, [id, navigate]);

  // 监听 store 变化（可选：如果其他标签页修改了数据）
  useEffect(() => {
    if (!id) return;
    const unsub = treasureStore.subscribe(() => {
      const t = treasureStore.get(id);
      if (t) setTreasure(t);
    });
    return unsub;
  }, [id]);

  /* ─── 选择卡片 ─── */

  const selectItemCard = useCallback((itemId: string) => {
    setSelectedCardId(itemId);
    setSelectedCurrencyKey(null);
    setSelectedXp(false);
    setSelectedQty(undefined); // 切换物品卡时清空上次的数量选择
  }, []);

  const selectCurrencyCard = useCallback((key: CurrencyKey) => {
    setSelectedCurrencyKey(key);
    setSelectedCardId(null);
    setSelectedXp(false);
    setSelectedQty(undefined);
  }, []);

  /** 角色卡片脉冲动画（接收物品时的视觉反馈） */
  const triggerReceiveAnim = useCallback((charId: string) => {
    const el = cardRefs.current.get(charId);
    if (!el || typeof (el as any).animate !== 'function') return;
    (el as any).animate(
      [
        { boxShadow: '0 0 0 0 rgba(99,102,241,0.45)', transform: 'scale(1)' },
        { boxShadow: '0 0 0 10px rgba(99,102,241,0)', transform: 'scale(1.03)' },
        { boxShadow: '0 0 0 0 rgba(99,102,241,0)', transform: 'scale(1)' },
      ],
      { duration: 600, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
    );
  }, []);

  /* ─── 长按处理 ─── */

  const startLongPress = useCallback(
    (itemId: string, maxQty: number, itemName: string) => {
      longPressTriggered.current = false;
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
      longPressTimer.current = window.setTimeout(() => {
        longPressTriggered.current = true;
        setSliderData({
          itemId,
          max: maxQty,
          current: 1,
          name: itemName,
        });
      }, 600);
    },
    []
  );

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const onCardMouseUp = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  const onCardMouseLeave = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  /* ─── 添加分配者 ─── */

  const addDistributor = useCallback((charId: string) => {
    const char = characterStore.get(charId);
    if (!char) return;
    setDistributions((prev) => {
      if (prev.some((d) => d.characterId === charId)) return prev;
      return [
        ...prev,
        {
          characterId: char.id,
          characterName: char.name,
          currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
          items: [],
          experience: 0,
        },
      ];
    });
  }, []);

  /* ─── 放入分配者框 ─── */

  const distributeToCharacter = useCallback(
    (charId: string) => {
      // 货币
      if (selectedCurrencyKey) {
        const amount = remainingCurrency[selectedCurrencyKey];
        if (amount <= 0) return;
        setRemainingCurrency((prev) => ({
          ...prev,
          [selectedCurrencyKey]: 0,
        }));
        setDistributions((prev) =>
          prev.map((d) =>
            d.characterId === charId
              ? {
                  ...d,
                  currency: {
                    ...d.currency,
                    [selectedCurrencyKey]: d.currency[selectedCurrencyKey] + amount,
                  },
                }
              : d
          )
        );
        setSelectedCurrencyKey(null);
        triggerReceiveAnim(charId);
        return;
      }

      // 经验值
      if (selectedXp) {
        if (remainingXp <= 0) return;
        const amount = remainingXp; // 全量分配
        setRemainingXp(0);
        setDistributions(prev => prev.map(d =>
          d.characterId === charId
            ? { ...d, experience: d.experience + amount }
            : d
        ));
        setSelectedXp(false);
        triggerReceiveAnim(charId);
        return;
      }

      // 物品
      if (!selectedCardId) return;
      const itemIndex = remainingItems.findIndex((it) => it.id === selectedCardId);
      if (itemIndex === -1) return;
      const item = remainingItems[itemIndex];
      // 有选中数量时用选中数量，否则全量
      const fullQty = item.quantity;
      const useQty =
        typeof selectedQty === 'number'
          ? Math.max(1, Math.min(selectedQty, fullQty))
          : fullQty;

      // 扣减 remainingItems
      if (useQty >= fullQty) {
        setRemainingItems((prev) => prev.filter((_, i) => i !== itemIndex));
      } else {
        setRemainingItems((prev) =>
          prev.map((it, i) =>
            i === itemIndex ? { ...it, quantity: it.quantity - useQty } : it
          )
        );
      }
      setSelectedCardId(null);
      setSelectedQty(undefined);

      // 仅定向分配给目标 charId + 生成 animKey 确保滑入动画播放
      const animKey = (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : `anim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setDistributions((prev) =>
        prev.map((d) =>
          d.characterId === charId
            ? {
                ...d,
                items: [
                  ...d.items,
                  {
                    id: item.id,
                    name: item.name,
                    quantity: useQty,
                    unitPrice: item.unitPrice,
                    animKey,
                  },
                ],
              }
            : d
        )
      );
      triggerReceiveAnim(charId);
    },
    [selectedCardId, selectedCurrencyKey, selectedXp, selectedQty, remainingItems, remainingCurrency, remainingXp, triggerReceiveAnim]
  );

  /* ─── 数量选择后分配 ─── */

  /**
   * 长按数量滑块确认：只更新选中数量+保持卡片选中，
   * 然后需要用户再点击某个角色卡片来完成定向分配。
   */
  const confirmSliderDistribution = useCallback(
    (qty: number) => {
      if (!sliderData) return;
      const itemId = sliderData.itemId;
      const itemIndex = remainingItems.findIndex((it) => it.id === itemId);
      if (itemIndex === -1) return;
      const item = remainingItems[itemIndex];
      const safeQty = Math.max(1, Math.min(qty, item.quantity));

      // 只记录待分配数量 + 保持选中卡片
      setSelectedQty(safeQty);
      setSelectedCardId(itemId);
      setSelectedCurrencyKey(null);
      setSliderData(null);
    },
    [sliderData, remainingItems]
  );

  /* ─── 从分配者退回物品 ─── */

  const returnItemToTreasure = useCallback(
    (charId: string, itemIndex: number) => {
      setDistributions((prev) =>
        prev.map((d) => {
          if (d.characterId !== charId) return d;
          const item = d.items[itemIndex];
          if (!item) return d;
          setRemainingItems((prevItems) => {
            const existing = prevItems.find((it) => it.id === item.id);
            if (existing) {
              return prevItems.map((it) =>
                it.id === item.id
                  ? { ...it, quantity: it.quantity + item.quantity }
                  : it
              );
            }
            return [
              ...prevItems,
              {
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              },
            ];
          });
          return {
            ...d,
            items: d.items.filter((_, i) => i !== itemIndex),
          };
        })
      );
    },
    []
  );

  /* ─── 从分配者退回货币 ─── */

  const returnCurrencyToTreasure = useCallback(
    (charId: string, key: CurrencyKey, amount: number) => {
      if (amount <= 0) return;
      setDistributions((prev) =>
        prev.map((d) =>
          d.characterId === charId
            ? {
                ...d,
                currency: {
                  ...d.currency,
                  [key]: d.currency[key] - amount,
                },
              }
            : d
        )
      );
      setRemainingCurrency((prev) => ({
        ...prev,
        [key]: prev[key] + amount,
      }));
    },
    []
  );

  /* ─── 从分配者退回经验值 ─── */

  const returnXpToTreasure = useCallback((charId: string, amount: number) => {
    if (amount <= 0) return;
    setDistributions(prev => prev.map(d =>
      d.characterId === charId
        ? { ...d, experience: d.experience - amount }
        : d
    ));
    setRemainingXp(prev => prev + amount);
  }, []);

  /* ─── 完成分配 ─── */

  const handleFinish = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const confirmFinish = useCallback(() => {
    if (!treasure || !id) return;

    distributions.forEach((dist) => {
      const char = characterStore.get(dist.characterId);
      if (!char) return;

      // 1. 加货币
      const newCurrency = {
        cp: char.currency.cp + dist.currency.cp,
        sp: char.currency.sp + dist.currency.sp,
        ep: char.currency.ep + dist.currency.ep,
        gp: char.currency.gp + dist.currency.gp,
        pp: char.currency.pp + dist.currency.pp,
      };

      // 2. 加物品（生成唯一 childId，按类型排序插入）
      let updatedEquipment = [...char.equipment];
      dist.items.forEach((item) => {
        const childId = crypto.randomUUID();
        const newEquip: Equipment = {
          id: item.id,
          childId,
          name: item.name,
          quantity: item.quantity,
          category: treasure.items.find((t) => t.id === item.id)?.equipmentSnapshot?.category || '杂项',
          weight: treasure.items.find((t) => t.id === item.id)?.equipmentSnapshot?.weight,
          price: item.unitPrice
            ? treasurePriceToEquipmentPrice(item.unitPrice)
            : undefined,
        };
        updatedEquipment.push(newEquip);
      });

      // 3. 按类型排序整理背包（复用 combatStore.sortInventory 统一逻辑）
      updatedEquipment = sortInventory(updatedEquipment);

      // 4. 加经验值
      const newXp = char.experience + dist.experience;

      characterStore.update(dist.characterId, {
        currency: newCurrency,
        equipment: updatedEquipment,
        experience: newXp,
      });

      // 5. 记录分配
      const record: DistributionRecord = {
        treasureId: id,
        characterId: dist.characterId,
        characterName: dist.characterName,
        currency: dist.currency,
        items: dist.items.map((it) => ({
          id: it.id,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        experience: dist.experience,
        distributedAt: Date.now(),
      };
      treasureStore.recordDistribution(record);
    });

    setShowConfirm(false);
    navigate('/inventory/treasures');
  }, [distributions, treasure, id, navigate]);

  if (!treasure) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* 顶栏 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/inventory/treasures')}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light flex items-center gap-2">
          <Gem className="w-6 h-6 text-primary" />
          宝藏分配
        </h1>
        <span className="ml-auto text-sm dark:text-text-dark-muted light:text-text-light-muted">
          {treasure.title}
        </span>
      </div>

      {/* ── 宝藏框 ── */}
      <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="font-semibold dark:text-text-dark light:text-text-light">宝藏</h2>
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted ml-auto">
            双击选择，再点击分配者框放入
          </span>
        </div>

        {/* 货币卡片 */}
        {CURRENCY_META.some((m) => remainingCurrency[m.key] > 0) && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">
                货币
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CURRENCY_META.filter((m) => remainingCurrency[m.key] > 0).map((m) => (
                <div
                  key={m.key}
                  onClick={() => selectCurrencyCard(m.key)}
                  onDoubleClick={() => selectCurrencyCard(m.key)}
                  className={
                    `rounded-lg border p-3 cursor-pointer transition-all select-none ` +
                    `${m.color} ` +
                    (selectedCurrencyKey === m.key
                      ? 'ring-2 ring-primary scale-[1.02] shadow-lg'
                      : 'hover:scale-[1.01]')
                  }
                >
                  <div className="text-xs opacity-70">{m.label}</div>
                  <div className="text-lg font-bold">{remainingCurrency[m.key]}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {remainingXp > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">
                经验值
              </span>
            </div>
            <div
              onClick={() => { setSelectedXp(true); setSelectedCardId(null); setSelectedCurrencyKey(null); }}
              className={`rounded-lg border p-3 cursor-pointer transition-all text-purple-300 bg-purple-900/20 border-purple-700/30 ${selectedXp ? 'ring-2 ring-primary scale-[1.02] shadow-lg' : 'hover:scale-[1.01]'}`}
            >
              <div className="text-xs opacity-70">XP</div>
              <div className="text-lg font-bold">{remainingXp}</div>
            </div>
          </div>
        )}

        {/* 物品卡片 */}
        {remainingItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">
                物品
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {remainingItems.map((item) => (
                <div
                  key={item.id}
                  onMouseDown={() => {
                    if (item.quantity > 1) {
                      startLongPress(item.id, item.quantity, item.name);
                    }
                  }}
                  onMouseUp={() => {
                    if (longPressTriggered.current) {
                      longPressTriggered.current = false;
                      return;
                    }
                    onCardMouseUp();
                    selectItemCard(item.id);
                  }}
                  onMouseLeave={onCardMouseLeave}
                  onTouchStart={() => {
                    if (item.quantity > 1) {
                      startLongPress(item.id, item.quantity, item.name);
                    }
                  }}
                  onTouchEnd={() => {
                    if (longPressTriggered.current) {
                      longPressTriggered.current = false;
                      return;
                    }
                    cancelLongPress();
                    selectItemCard(item.id);
                  }}
                  className={
                    `rounded-lg border p-3 cursor-pointer transition-all select-none ` +
                    `dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light ` +
                    (selectedCardId === item.id
                      ? 'ring-2 ring-primary scale-[1.02] shadow-lg'
                      : 'hover:scale-[1.01]')
                  }
                >
                  <div className="font-medium text-sm dark:text-text-dark light:text-text-light truncate">
                    {item.name}
                  </div>
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                    ×{item.quantity}
                    {item.unitPrice !== undefined && (
                      <span className="ml-1 opacity-70">
                        ({item.unitPrice.amount}{item.unitPrice.unit})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {remainingItems.length === 0 &&
          CURRENCY_META.every((m) => remainingCurrency[m.key] === 0) &&
          remainingXp === 0 && (
            <div className="text-center py-6 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              <Check className="w-6 h-6 mx-auto mb-1 text-green-500" />
              宝藏已全部分配
            </div>
          )}
      </div>

      {/* ── 分配者框 ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-semibold dark:text-text-dark light:text-text-light">分配对象</h2>
          <button
            onClick={() => setShowCharPicker(true)}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm bg-primary text-white hover:bg-primary/90 transition-colors flex items-center gap-1"
          >
            <Users className="w-4 h-4" />
            选择角色
          </button>
        </div>

        {distributions.length === 0 && (
          <div className="text-center py-8 rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40 dark:text-text-dark-muted light:text-text-light-muted" />
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              点击上方按钮选择角色开始分配
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {distributions.map((dist) => (
            <div
              key={dist.characterId}
              ref={(el) => {
                if (el) cardRefs.current.set(dist.characterId, el);
                else cardRefs.current.delete(dist.characterId);
              }}
              onClick={() => {
                if (selectedCardId || selectedCurrencyKey || selectedXp) {
                  distributeToCharacter(dist.characterId);
                }
              }}
              className={
                `rounded-xl border p-4 transition-all ` +
                `dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light ` +
                (selectedCardId || selectedCurrencyKey || selectedXp
                  ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-[1.01]'
                  : '')
              }
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {dist.characterName.charAt(0)}
                  </div>
                  <span className="font-medium dark:text-text-dark light:text-text-light">
                    {dist.characterName}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDistributions((prev) =>
                      prev.filter((d) => d.characterId !== dist.characterId)
                    );
                  }}
                  className="p-1 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 已分配的货币 */}
              {CURRENCY_META.some((m) => dist.currency[m.key] > 0) && (
                <div className="mb-3">
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
                    货币
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CURRENCY_META.filter((m) => dist.currency[m.key] > 0).map((m) => (
                      <button
                        key={m.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          returnCurrencyToTreasure(dist.characterId, m.key, dist.currency[m.key]);
                        }}
                        className={
                          `px-2 py-1 rounded text-xs font-medium transition-all ` +
                          `${m.color} hover:opacity-80 flex items-center gap-1`
                        }
                      >
                        {m.label} {dist.currency[m.key]}
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 已分配的经验值 */}
              {dist.experience > 0 && (
                <div className="mb-3">
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
                    经验值
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      returnXpToTreasure(dist.characterId, dist.experience);
                    }}
                    className="px-2 py-1 rounded text-xs font-medium transition-all text-purple-300 bg-purple-900/20 border-purple-700/30 hover:opacity-80 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    {dist.experience} XP
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* 已分配的物品 */}
              {dist.items.length > 0 && (
                <div>
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
                    物品
                  </div>
                  <div className="space-y-1">
                    {dist.items.map((item, idx) => (
                      <button
                        key={item.animKey ? `${item.id}-${item.animKey}` : `${item.id}-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          returnItemToTreasure(dist.characterId, idx);
                        }}
                        className={
                          `w-full text-left px-2 py-1.5 rounded text-sm dark:bg-white/5 light:bg-black/5 dark:text-text-dark light:text-text-light hover:bg-primary/10 transition-colors flex items-center justify-between group ` +
                          (item.animKey ? 'treasure-item-enter ' : '')
                        }
                      >
                        <span className="truncate">
                          {item.name} ×{item.quantity}
                        </span>
                        <ArrowLeft className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {dist.items.length === 0 &&
                CURRENCY_META.every((m) => dist.currency[m.key] === 0) &&
                dist.experience === 0 && (
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted py-2">
                    暂无分配
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 完成按钮 ── */}
      {distributions.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t dark:border-border-dark light:border-border-light z-50">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              {distributions.filter((d) => d.items.length > 0 || Object.values(d.currency).some((v) => v > 0) || d.experience > 0).length}{' '}
              个角色已分配
            </div>
            <button
              onClick={handleFinish}
              className="px-6 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              完成分配
            </button>
          </div>
        </div>
      )}

      {/* ── 角色选择弹窗 ── */}
      {showCharPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold dark:text-text-dark light:text-text-light">选择角色</h3>
              <button
                onClick={() => setShowCharPicker(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5 dark:text-text-dark light:text-text-light" />
              </button>
            </div>
            <div className="space-y-2">
              {characterStore.getAll().map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    addDistributor(char.id);
                    setShowCharPicker(false);
                  }}
                  disabled={distributions.some((d) => d.characterId === char.id)}
                  className={
                    `w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ` +
                    (distributions.some((d) => d.characterId === char.id)
                      ? 'opacity-40 cursor-not-allowed dark:border-border-dark light:border-border-light'
                      : 'hover:border-primary dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light')
                  }
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {char.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium dark:text-text-dark light:text-text-light">
                      {char.name}
                    </div>
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      {char.class} Lv.{char.level}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 滑动游标弹窗 ── */}
      {sliderData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6">
            <h3 className="font-semibold dark:text-text-dark light:text-text-light mb-1">
              {sliderData.name}
            </h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              选择分配数量（最多 {sliderData.max}）
            </p>

            <input
              type="range"
              min={1}
              max={sliderData.max}
              value={sliderData.current}
              onChange={(e) =>
                setSliderData((prev) =>
                  prev ? { ...prev, current: Number(e.target.value) } : null
                )
              }
              className="w-full mb-4 accent-primary"
            />

            <div className="text-center text-2xl font-bold dark:text-text-dark light:text-text-light mb-6">
              {sliderData.current} / {sliderData.max}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSliderData(null)}
                className="px-4 py-2.5 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => confirmSliderDistribution(sliderData.current)}
                className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
              >
                分配 {sliderData.current} 个
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 确认弹窗 ── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6 max-h-[80vh] overflow-auto">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-primary" />
              <h3 className="font-semibold dark:text-text-dark light:text-text-light">
                确认分配结果
              </h3>
            </div>

            <div className="space-y-4 mb-6">
              {distributions.map((dist) => {
                const hasItems = dist.items.length > 0;
                const hasCurrency = Object.values(dist.currency).some((v) => v > 0);
                const hasXp = dist.experience > 0;
                if (!hasItems && !hasCurrency && !hasXp) return null;

                return (
                  <div
                    key={dist.characterId}
                    className="rounded-lg border dark:border-border-dark light:border-border-light p-3"
                  >
                    <div className="font-medium dark:text-text-dark light:text-text-light mb-2">
                      {dist.characterName}
                    </div>
                    {hasCurrency && (
                      <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-1">
                        货币：{formatCurrencyShort(dist.currency)}
                      </div>
                    )}
                    {hasItems && (
                      <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        物品：{dist.items.map((i) => `${i.name}×${i.quantity}`).join('、')}
                      </div>
                    )}
                    {hasXp && (
                      <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        经验值：{dist.experience} XP
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2.5 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
              >
                返回修改
              </button>
              <button
                onClick={confirmFinish}
                className="px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                确认分配
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
