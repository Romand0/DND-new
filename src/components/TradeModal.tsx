// 交易 / 物资分配弹窗
// 三种模式：买入（从装备库选购入发起者背包）/ 卖出（从背包售出换货币）/ 分配（背包+现金转移给他人）
import { useState, useMemo, useEffect } from 'react';
import { X, Coins, ShoppingCart, TrendingDown, Share2, Plus, Minus, Search, Check, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import { fetchAllEquipments } from '@/lib/api';
import type { Character, Equipment, Currency } from '@/types/character';
import type { EquipmentItem } from '@/types/equipment';

type Mode = 'buy' | 'sell' | 'transfer';

// 买入清单项
interface BuyCartItem {
  item: EquipmentItem;
  quantity: number;
}

// 卖出清单项
interface SellCartItem {
  item: Equipment;
  quantity: number;
  unitPriceCp: number; // 单件售价（铜币）
}

// 分配清单项（物资）
interface TransferEquipItem {
  item: Equipment;
  quantity: number;
}
// 分配现金（铜币总数）
interface TransferCashItem {
  cp: number;
}

interface Props {
  /** 发起角色 ID */
  characterId: string;
  onClose: () => void;
}

// 格式化货币展示
function formatCurrency(c: Currency): string {
  const parts: string[] = [];
  if (c.pp > 0) parts.push(`${c.pp}pp`);
  if (c.gp > 0) parts.push(`${c.gp}gp`);
  if (c.sp > 0) parts.push(`${c.sp}sp`);
  if (c.cp > 0) parts.push(`${c.cp}cp`);
  return parts.length > 0 ? parts.join(' ') : '0cp';
}

// 铜币总数展示
function formatCopper(totalCp: number): string {
  return formatCurrency(characterStore.copperToCurrency(totalCp));
}

// 判断是否为原价售卖家分类：杂物 + 子分类为 宝石/珠宝/艺术品
function isFullPriceItem(item: Equipment): boolean {
  if (item.category !== '杂物') return false;
  const sub = item.subtype || '';
  return sub === '宝石' || sub === '珠宝' || sub === '艺术品';
}

export default function TradeModal({ characterId, onClose }: Props) {
  const [character, setCharacter] = useState<Character | null>(() => characterStore.get(characterId));
  const [mode, setMode] = useState<Mode>('buy');
  // 买入
  const [buySearch, setBuySearch] = useState('');
  const [buyCart, setBuyCart] = useState<BuyCartItem[]>([]);
  // 卖出
  const [sellCart, setSellCart] = useState<SellCartItem[]>([]);
  // 分配
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferEquip, setTransferEquip] = useState<TransferEquipItem[]>([]);
  const [transferCp, setTransferCp] = useState<string>(''); // 玩家输入的铜币数
  // 完成提示
  const [doneMsg, setDoneMsg] = useState('');

  // 交易完成后（doneMsg 变化）刷新角色数据
  useEffect(() => {
    setCharacter(characterStore.get(characterId));
  }, [characterId, doneMsg]);

  // 所有可选角色（除自己）
  const otherCharacters = useMemo(() => {
    return characterStore.getAll().filter(c => c.id !== characterId);
  }, [characterId]);

  // 装备库（买入用）：从 D1 数据库实时读取，仿照物资库页面（EquipmentList）实现
  const [libraryItems, setLibraryItems] = useState<EquipmentItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');

  const loadLibrary = async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const data = await fetchAllEquipments<EquipmentItem[]>();
      data.sort((a, b) => a.id.localeCompare(b.id));
      setLibraryItems(data);
    } catch (e: any) {
      setLibraryError(e.message || '装备库加载失败');
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => { loadLibrary(); }, []);

  const filteredLibrary = useMemo(() => {
    if (!buySearch) return libraryItems;
    const q = buySearch.toLowerCase();
    return libraryItems.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.subtype || '').toLowerCase().includes(q)
    );
  }, [libraryItems, buySearch]);

  // ============ 买入清单计算 ============
  const buyTotalCp = useMemo(() => {
    return buyCart.reduce((sum, ci) => {
      return sum + characterStore.priceToCopper(ci.item.price) * ci.quantity;
    }, 0);
  }, [buyCart]);

  const buyTotalWeight = useMemo(() => {
    return buyCart.reduce((sum, ci) => {
      const w = ci.item.weight || 0;
      if (ci.item.packSize && ci.item.packSize > 0) {
        return sum + (w / ci.item.packSize) * ci.quantity;
      }
      return sum + w * ci.quantity;
    }, 0);
  }, [buyCart]);

  const buyAffordable = character ? characterStore.canAfford(character.currency, buyTotalCp) : false;

  // 买入：添加/调整清单
  const addBuyItem = (item: EquipmentItem) => {
    setBuyCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id);
      if (existing) {
        return prev.map(ci => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + (item.packSize && item.packSize > 0 ? item.packSize : 1) } : ci);
      }
      // 默认数量：有 packSize 则为 packSize（整份），否则 1
      const defaultQty = item.packSize && item.packSize > 0 ? item.packSize : 1;
      return [...prev, { item, quantity: defaultQty }];
    });
  };
  const updateBuyQty = (itemId: string, delta: number) => {
    setBuyCart(prev => prev.map(ci => {
      if (ci.item.id !== itemId) return ci;
      const step = ci.item.packSize && ci.item.packSize > 0 ? ci.item.packSize : 1;
      const next = ci.quantity + delta * step;
      return { ...ci, quantity: Math.max(step, next) };
    }));
  };
  const setBuyQty = (itemId: string, val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) return;
    setBuyCart(prev => prev.map(ci => ci.item.id === itemId ? { ...ci, quantity: n } : ci));
  };
  const removeBuyItem = (itemId: string) => {
    setBuyCart(prev => prev.filter(ci => ci.item.id !== itemId));
  };

  // 执行买入
  const handleConfirmBuy = () => {
    if (!character || buyCart.length === 0 || !buyAffordable) return;
    // 扣款
    const newCurrency = characterStore.deductCurrency(character.currency, buyTotalCp);
    // 逐件加入背包
    buyCart.forEach(ci => {
      const data: Partial<Equipment> = {
        id: ci.item.id,
        name: ci.item.name,
        category: ci.item.category,
        subtype: ci.item.subtype,
        weight: ci.item.weight,
        packSize: ci.item.packSize,
        unit: ci.item.unit,
        price: ci.item.price,
        quantity: ci.quantity,
        damageDice: ci.item.damageDice,
        damageType: ci.item.damageType,
        acBase: ci.item.acBase,
        strengthReq: ci.item.strengthReq,
        stealthDisadvantage: ci.item.stealthDisadvantage,
        description: ci.item.description,
        properties: ci.item.properties,
        source: ci.item.source,
        dataResource: ci.item.dataResource,
      };
      characterStore.addEquipment(character.id, data);
    });
    characterStore.update(character.id, { currency: newCurrency });
    setDoneMsg(`购买完成，花费 ${formatCopper(buyTotalCp)}`);
    setBuyCart([]);
  };

  // ============ 卖出 ============
  const sellableItems = useMemo(() => {
    if (!character) return [];
    return character.equipment.filter(e => e.price && e.price.amount > 0);
  }, [character]);

  const sellTotalCp = useMemo(() => {
    return sellCart.reduce((sum, ci) => sum + ci.unitPriceCp * ci.quantity, 0);
  }, [sellCart]);

  const addSellItem = (item: Equipment) => {
    // 计算单件售价：宝石/珠宝/艺术品原价，其余半价
    const baseCp = characterStore.priceToCopper(item.price!);
    const unitPriceCp = isFullPriceItem(item) ? baseCp : Math.floor(baseCp / 2);
    const maxQty = item.quantity || 1;
    setSellCart(prev => {
      if (prev.some(ci => ci.item.childId === item.childId || ci.item.id === item.id)) return prev;
      return [...prev, { item, quantity: 1, unitPriceCp }];
    });
    void maxQty;
  };
  const updateSellQty = (key: string, delta: number) => {
    setSellCart(prev => prev.map(ci => {
      const k = ci.item.childId || ci.item.id || '';
      if (k !== key) return ci;
      const maxQty = ci.item.quantity || 1;
      const next = Math.min(maxQty, Math.max(1, ci.quantity + delta));
      return { ...ci, quantity: next };
    }));
  };
  const setSellQty = (key: string, val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) return;
    setSellCart(prev => prev.map(ci => {
      const k = ci.item.childId || ci.item.id || '';
      if (k !== key) return ci;
      const maxQty = ci.item.quantity || 1;
      return { ...ci, quantity: Math.min(maxQty, n) };
    }));
  };
  const removeSellItem = (key: string) => {
    setSellCart(prev => prev.filter(ci => (ci.item.childId || ci.item.id || '') !== key));
  };

  // 执行卖出
  const handleConfirmSell = () => {
    if (!character || sellCart.length === 0) return;
    // 加款：现有货币 + 卖出所得，重新规范化
    const currentCp = characterStore.currencyToCopper(character.currency);
    const newCurrency = characterStore.copperToCurrency(currentCp + sellTotalCp);
    // 逐件扣减/删除
    sellCart.forEach(ci => {
      const key = ci.item.childId || ci.item.id || '';
      const remaining = (ci.item.quantity || 1) - ci.quantity;
      if (remaining <= 0) {
        characterStore.deleteEquipment(character.id, key);
      } else {
        characterStore.updateEquipment(character.id, key, { quantity: remaining });
      }
    });
    characterStore.update(character.id, { currency: newCurrency });
    setDoneMsg(`售出完成，获得 ${formatCopper(sellTotalCp)}`);
    setSellCart([]);
  };

  // ============ 分配 ============
  const transferTarget = useMemo(() => characterStore.get(transferTargetId), [transferTargetId]);

  const transferEquipTotalWeight = useMemo(() => {
    return transferEquip.reduce((sum, ti) => {
      const w = ti.item.weight || 0;
      if (ti.item.packSize && ti.item.packSize > 0) {
        return sum + (w / ti.item.packSize) * ti.quantity;
      }
      return sum + w * ti.quantity;
    }, 0);
  }, [transferEquip]);

  const transferCpNum = parseInt(transferCp, 10) || 0;
  const transferAffordable = character ? characterStore.canAfford(character.currency, transferCpNum) : false;
  const transferHasContent = transferEquip.length > 0 || transferCpNum > 0;

  const addTransferEquip = (item: Equipment) => {
    setTransferEquip(prev => {
      if (prev.some(ti => (ti.item.childId || ti.item.id) === (item.childId || item.id))) return prev;
      return [...prev, { item, quantity: 1 }];
    });
  };
  const updateTransferQty = (key: string, delta: number) => {
    setTransferEquip(prev => prev.map(ti => {
      const k = ti.item.childId || ti.item.id || '';
      if (k !== key) return ti;
      const maxQty = ti.item.quantity || 1;
      const next = Math.min(maxQty, Math.max(1, ti.quantity + delta));
      return { ...ti, quantity: next };
    }));
  };
  const setTransferQty = (key: string, val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) return;
    setTransferEquip(prev => prev.map(ti => {
      const k = ti.item.childId || ti.item.id || '';
      if (k !== key) return ti;
      const maxQty = ti.item.quantity || 1;
      return { ...ti, quantity: Math.min(maxQty, n) };
    }));
  };
  const removeTransferEquip = (key: string) => {
    setTransferEquip(prev => prev.filter(ti => (ti.item.childId || ti.item.id || '') !== key));
  };

  // 执行分配
  const handleConfirmTransfer = () => {
    if (!character || !transferTarget || !transferHasContent) return;
    if (!transferAffordable && transferCpNum > 0) return;

    // 转移物资
    transferEquip.forEach(ti => {
      const key = ti.item.childId || ti.item.id || '';
      // 加入目标背包（让目标重新生成 childId）
      const { childId: _omit, quantity: _q, ...rest } = ti.item;
      void _omit; void _q;
      characterStore.addEquipment(transferTarget.id, { ...rest, quantity: ti.quantity });
      // 从源扣减/删除
      const remaining = (ti.item.quantity || 1) - ti.quantity;
      if (remaining <= 0) {
        characterStore.deleteEquipment(character.id, key);
      } else {
        characterStore.updateEquipment(character.id, key, { quantity: remaining });
      }
    });

    // 转移现金
    if (transferCpNum > 0) {
      const sourceNewCurrency = characterStore.deductCurrency(character.currency, transferCpNum);
      const targetCurrentCp = characterStore.currencyToCopper(transferTarget.currency);
      const targetNewCurrency = characterStore.copperToCurrency(targetCurrentCp + transferCpNum);
      characterStore.update(character.id, { currency: sourceNewCurrency });
      characterStore.update(transferTarget.id, { currency: targetNewCurrency });
    }

    setDoneMsg(`已分配给 ${transferTarget.name}：${transferEquip.length > 0 ? `${transferEquip.length} 件物资` : ''}${transferEquip.length > 0 && transferCpNum > 0 ? ' + ' : ''}${transferCpNum > 0 ? formatCopper(transferCpNum) : ''}`);
    setTransferEquip([]);
    setTransferCp('');
  };

  if (!character) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="dark:bg-card-dark light:bg-card-light rounded-xl p-6" onClick={e => e.stopPropagation()}>
          <p className="dark:text-text-dark light:text-text-light">角色未找到</p>
          <button onClick={onClose} className="mt-3 px-4 py-2 bg-primary text-white rounded-lg">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="dark:bg-card-dark light:bg-card-light rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b dark:border-border-dark light:border-border-light shrink-0">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            <span className="font-bold dark:text-text-dark light:text-text-light">交易与物资分配</span>
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">· {character.name}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5 dark:text-text-dark light:text-text-light" /></button>
        </div>

        {/* 当前现金 */}
        <div className="px-5 py-2 border-b dark:border-border-dark light:border-border-light flex items-center gap-2 flex-wrap text-sm shrink-0">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">当前现金：</span>
          <span className="font-bold text-primary">{formatCurrency(character.currency)}</span>
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">（{characterStore.currencyToCopper(character.currency)}cp）</span>
        </div>

        {/* 模式切换 */}
        <div className="px-5 py-3 border-b dark:border-border-dark light:border-border-light shrink-0">
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'buy', label: '买入', icon: ShoppingCart, desc: '从装备库购买' },
              { key: 'sell', label: '卖出', icon: TrendingDown, desc: '售出背包物品' },
              { key: 'transfer', label: '分配', icon: Share2, desc: '转移给他/她人' },
            ] as const).map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setMode(opt.key); setDoneMsg(''); }}
                  className={`py-2 px-3 rounded-lg flex flex-col items-center gap-1 transition-all ${
                    mode === opt.key ? 'bg-primary text-white ring-2 ring-primary' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-[10px] opacity-80">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 完成提示 */}
        {doneMsg && (
          <div className="mx-5 mt-3 p-2.5 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 text-sm flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4" />
            {doneMsg}
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ============ 买入 ============ */}
          {mode === 'buy' && (
            <div className="space-y-4">
              {/* 搜索 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                <input
                  type="text"
                  value={buySearch}
                  onChange={e => setBuySearch(e.target.value)}
                  placeholder="搜索装备库..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 装备库列表 */}
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">装备库</div>
                    <button
                      onClick={loadLibrary}
                      disabled={libraryLoading}
                      className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                      title="从云端刷新"
                    >
                      {libraryLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      刷新
                    </button>
                  </div>
                  {libraryError ? (
                    <div className="text-center text-sm text-danger py-8 px-2">
                      {libraryError}
                      <button onClick={loadLibrary} className="ml-2 underline">重试</button>
                    </div>
                  ) : libraryLoading && libraryItems.length === 0 ? (
                    <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> 加载装备库中...
                    </div>
                  ) : filteredLibrary.length === 0 ? (
                    <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">无匹配物品</div>
                  ) : (
                    filteredLibrary.map(item => {
                      const inCart = buyCart.some(ci => ci.item.id === item.id);
                      return (
                        <div key={item.id} className="rounded-lg border dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark light:bg-bg-light-2 p-2.5 flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm dark:text-text-dark light:text-text-light truncate">{item.name}</span>
                              <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary">{item.category}</span>
                              {item.subtype && <span className="text-[10px] px-1 py-0.5 rounded dark:bg-white/10 light:bg-white/60 dark:text-text-dark-muted light:text-text-light-muted">{item.subtype}</span>}
                            </div>
                            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                              {item.price.amount}{item.price.unit} · {(item.weight || 0).toFixed(1)}磅
                              {item.packSize && item.packSize > 0 ? ` · 每份${item.packSize}${item.unit || '个'}` : ''}
                            </div>
                          </div>
                          <button
                            onClick={() => addBuyItem(item)}
                            disabled={inCart}
                            className={`shrink-0 p-1.5 rounded-lg ${inCart ? 'bg-green-500/20 text-green-500' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                            title={inCart ? '已加入清单' : '加入清单'}
                          >
                            {inCart ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 购买清单 */}
                <div className="space-y-2">
                  <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted px-1">购买清单</div>
                  {buyCart.length === 0 ? (
                    <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8 rounded-lg border border-dashed dark:border-border-dark light:border-border-light">
                      尚未选择物品
                    </div>
                  ) : (
                    <>
                      {buyCart.map(ci => (
                        <div key={ci.item.id} className="rounded-lg border dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark light:bg-bg-light-2 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{ci.item.name}</span>
                            <button onClick={() => removeBuyItem(ci.item.id)} className="text-xs text-danger hover:underline shrink-0">移除</button>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">数量</span>
                            <button onClick={() => updateBuyQty(ci.item.id, -1)} className="p-0.5 rounded hover:bg-white/10"><Minus className="w-3.5 h-3.5 dark:text-text-dark light:text-text-light" /></button>
                            <input
                              type="number"
                              value={ci.quantity}
                              onChange={e => setBuyQty(ci.item.id, e.target.value)}
                              className="w-16 px-2 py-1 text-center text-sm rounded border bg-transparent dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
                            />
                            <button onClick={() => updateBuyQty(ci.item.id, 1)} className="p-0.5 rounded hover:bg-white/10"><Plus className="w-3.5 h-3.5 dark:text-text-dark light:text-text-light" /></button>
                            {ci.item.packSize && ci.item.packSize > 0 && (
                              <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">±{ci.item.packSize}{ci.item.unit || '个'}/份</span>
                            )}
                          </div>
                          <div className="text-xs text-primary mt-1">
                            小计 {formatCopper(characterStore.priceToCopper(ci.item.price) * ci.quantity)}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* 结算栏 */}
              {buyCart.length > 0 && (
                <div className="sticky bottom-0 dark:bg-card-dark light:bg-card-light border-t dark:border-border-dark light:border-border-light p-3 -mx-5 -mb-5 mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">总重量</span>
                    <span className="dark:text-text-dark light:text-text-light">{buyTotalWeight.toFixed(1)} 磅</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">消费总额</span>
                    <span className="font-bold text-danger">{formatCopper(buyTotalCp)}</span>
                  </div>
                  {!buyAffordable && (
                    <div className="flex items-center gap-1.5 text-xs text-danger">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      现金不足，无法购买
                    </div>
                  )}
                  <button
                    onClick={handleConfirmBuy}
                    disabled={!buyAffordable}
                    className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    确认购买 · {formatCopper(buyTotalCp)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============ 卖出 ============ */}
          {mode === 'sell' && (
            <div className="space-y-4">
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5">
                售价规则：武器/护甲/杂物按半价；杂物子分类为「宝石」「珠宝」「艺术品」按原价
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 可售物品 */}
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted px-1">背包物品（有定价）</div>
                  {sellableItems.length === 0 ? (
                    <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">无可售物品</div>
                  ) : (
                    sellableItems.map(item => {
                      const key = item.childId || item.id || '';
                      const inCart = sellCart.some(ci => (ci.item.childId || ci.item.id || '') === key);
                      const baseCp = characterStore.priceToCopper(item.price!);
                      const unitPriceCp = isFullPriceItem(item) ? baseCp : Math.floor(baseCp / 2);
                      return (
                        <div key={key} className="rounded-lg border dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark light:bg-bg-light-2 p-2.5 flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm dark:text-text-dark light:text-text-light truncate">{item.name}</span>
                              <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary">{item.category}</span>
                              {isFullPriceItem(item) && <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/10 text-green-500">原价</span>}
                              {!isFullPriceItem(item) && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">半价</span>}
                            </div>
                            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                              持有 ×{item.quantity || 1} · 单件售 {formatCopper(unitPriceCp)}
                            </div>
                          </div>
                          <button
                            onClick={() => addSellItem(item)}
                            disabled={inCart}
                            className={`shrink-0 p-1.5 rounded-lg ${inCart ? 'bg-green-500/20 text-green-500' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                          >
                            {inCart ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 售卖清单 */}
                <div className="space-y-2">
                  <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted px-1">售卖清单</div>
                  {sellCart.length === 0 ? (
                    <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8 rounded-lg border border-dashed dark:border-border-dark light:border-border-light">
                      尚未选择物品
                    </div>
                  ) : (
                    sellCart.map(ci => {
                      const key = ci.item.childId || ci.item.id || '';
                      return (
                        <div key={key} className="rounded-lg border dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark light:bg-bg-light-2 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{ci.item.name}</span>
                            <button onClick={() => removeSellItem(key)} className="text-xs text-danger hover:underline shrink-0">移除</button>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">数量</span>
                            <button onClick={() => updateSellQty(key, -1)} className="p-0.5 rounded hover:bg-white/10"><Minus className="w-3.5 h-3.5 dark:text-text-dark light:text-text-light" /></button>
                            <input
                              type="number"
                              value={ci.quantity}
                              onChange={e => setSellQty(key, e.target.value)}
                              className="w-16 px-2 py-1 text-center text-sm rounded border bg-transparent dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
                            />
                            <button onClick={() => updateSellQty(key, 1)} className="p-0.5 rounded hover:bg-white/10"><Plus className="w-3.5 h-3.5 dark:text-text-dark light:text-text-light" /></button>
                            <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">最多 {ci.item.quantity || 1}</span>
                          </div>
                          <div className="text-xs text-green-500 mt-1">
                            小计 {formatCopper(ci.unitPriceCp * ci.quantity)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {sellCart.length > 0 && (
                <div className="sticky bottom-0 dark:bg-card-dark light:bg-card-light border-t dark:border-border-dark light:border-border-light p-3 -mx-5 -mb-5 mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">售出所得</span>
                    <span className="font-bold text-green-500">{formatCopper(sellTotalCp)}</span>
                  </div>
                  <button
                    onClick={handleConfirmSell}
                    className="w-full py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <TrendingDown className="w-4 h-4" />
                    确认售出 · 获得 {formatCopper(sellTotalCp)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============ 分配 ============ */}
          {mode === 'transfer' && (
            <div className="space-y-4">
              {/* 目标选择 */}
              <div>
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1.5">分配目标</label>
                {otherCharacters.length === 0 ? (
                  <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted py-2">无其他可选角色</div>
                ) : (
                  <select
                    value={transferTargetId}
                    onChange={e => setTransferTargetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  >
                    <option value="">请选择...</option>
                    {otherCharacters.map(c => (
                      <option key={c.id} value={c.id} className="dark:bg-bg-dark light:bg-bg-light">{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {transferTarget && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 源背包 */}
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                      <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted px-1">从背包选择物资</div>
                      {character.equipment.length === 0 ? (
                        <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">背包为空</div>
                      ) : (
                        character.equipment.map(item => {
                          const key = item.childId || item.id || '';
                          const inList = transferEquip.some(ti => (ti.item.childId || ti.item.id || '') === key);
                          return (
                            <div key={key} className="rounded-lg border dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark light:bg-bg-light-2 p-2.5 flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{item.name}</span>
                                  <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">×{item.quantity || 1}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => addTransferEquip(item)}
                                disabled={inList}
                                className={`shrink-0 p-1.5 rounded-lg ${inList ? 'bg-green-500/20 text-green-500' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                              >
                                {inList ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* 分配清单 */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted px-1">分配清单</div>
                      {transferEquip.length === 0 ? (
                        <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-6 rounded-lg border border-dashed dark:border-border-dark light:border-border-light">
                          尚未选择物资
                        </div>
                      ) : (
                        transferEquip.map(ti => {
                          const key = ti.item.childId || ti.item.id || '';
                          return (
                            <div key={key} className="rounded-lg border dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark light:bg-bg-light-2 p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{ti.item.name}</span>
                                <button onClick={() => removeTransferEquip(key)} className="text-xs text-danger hover:underline shrink-0">移除</button>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">数量</span>
                                <button onClick={() => updateTransferQty(key, -1)} className="p-0.5 rounded hover:bg-white/10"><Minus className="w-3.5 h-3.5 dark:text-text-dark light:text-text-light" /></button>
                                <input
                                  type="number"
                                  value={ti.quantity}
                                  onChange={e => setTransferQty(key, e.target.value)}
                                  className="w-16 px-2 py-1 text-center text-sm rounded border bg-transparent dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
                                />
                                <button onClick={() => updateTransferQty(key, 1)} className="p-0.5 rounded hover:bg-white/10"><Plus className="w-3.5 h-3.5 dark:text-text-dark light:text-text-light" /></button>
                                <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">最多 {ti.item.quantity || 1}</span>
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* 现金分配 */}
                      <div className="rounded-lg border dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark light:bg-bg-light-2 p-2.5">
                        <div className="text-xs font-medium dark:text-text-dark light:text-text-light mb-1.5">现金分配（铜币总数）</div>
                        <input
                          type="number"
                          value={transferCp}
                          onChange={e => setTransferCp(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-1.5 rounded border bg-transparent text-sm outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                        />
                        {transferCpNum > 0 && (
                          <div className="text-xs text-primary mt-1">= {formatCopper(transferCpNum)}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 结算栏 */}
                  {transferHasContent && (
                    <div className="sticky bottom-0 dark:bg-card-dark light:bg-card-light border-t dark:border-border-dark light:border-border-light p-3 -mx-5 -mb-5 mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="dark:text-text-dark-muted light:text-text-light-muted">物资重量</span>
                        <span className="dark:text-text-dark light:text-text-light">{transferEquipTotalWeight.toFixed(1)} 磅</span>
                      </div>
                      {transferCpNum > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="dark:text-text-dark-muted light:text-text-light-muted">现金</span>
                          <span className={transferAffordable ? 'text-primary' : 'text-danger'}>
                            {formatCopper(transferCpNum)} {transferAffordable ? '' : '（不足）'}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={handleConfirmTransfer}
                        disabled={!transferHasContent || (transferCpNum > 0 && !transferAffordable)}
                        className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Share2 className="w-4 h-4" />
                        确认分配给 {transferTarget.name}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
