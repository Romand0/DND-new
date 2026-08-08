import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import combatStore from '@/data/combatStore';
import battlegroundStore from '@/data/battlegroundStore';
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';
import { Zap, Trash2, Download, Upload, FileJson } from 'lucide-react';
import QuickCreateCombatDialog, { type QuickCreateResult } from '@/components/combat/QuickCreateCombatDialog';

export default function CombatList() {
  const { isDM } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CombatRecord[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  // 加载战斗记录
  const loadRecords = useCallback(() => {
    const data = combatStore.getAll();
    console.log('[CombatList] 加载到战斗记录:', data.length, '条');
    setRecords(data);
  }, []);

  useEffect(() => {
    loadRecords();
    const unsubscribe = combatStore.subscribe(loadRecords);
    return unsubscribe;
  }, [loadRecords]);

  // 快速创建战斗：弹窗填名称 + 选 PC + 填先攻 → 自动建表 + 第一轮 + 跳转
  const handleQuickCreateConfirm = (result: QuickCreateResult) => {
    try {
      // 1) 构造 combatants（按先攻高→低排序，同先攻保持输入顺序）
      const combatantBases: Omit<Combatant, 'id'>[] = result.combatants.map(c => ({
        name: c.name,
        initiative: c.initiative,
        ac: c.ac,
        maxHp: c.maxHp,
        currentHp: c.currentHp,
        isPc: true,
        characterId: c.characterId,
        speed: c.speed,
        note: '',
        actions: 1,
      }));
      // 按先攻降序，稳定排序（index 作为 tiebreaker 保持原序）
      combatantBases.sort((a, b) => b.initiative - a.initiative);

      // 2) 创建战斗记录（第一轮 rounds 为空，下面再补）
      const newRecord = combatStore.create(result.title, combatantBases);
      if (!newRecord?.id) {
        alert('创建失败：未获取到战斗ID');
        loadRecords();
        setQuickCreateOpen(false);
        return;
      }

      // 3) 补充第一轮 RoundAction：每个参战者一个空字符串格子
      const firstRound: RoundAction = {};
      newRecord.combatants.forEach(c => { firstRound[c.id] = ''; });
      combatStore.update(newRecord.id, {
        rounds: [firstRound],
        updatedAt: Date.now(),
      });

      // 4) 初始化对应沙盘：getOrCreate 若不存在则按 medium 尺寸创建
      battlegroundStore.getOrCreate(newRecord.id);

      console.log('[CombatList] 快速创建战斗成功，ID:', newRecord.id);
      setQuickCreateOpen(false);
      navigate(`/combat/${newRecord.id}`);
    } catch (e) {
      console.error('[CombatList] 快速创建战斗失败:', e);
      alert('创建失败，请重试');
    }
  };

  // 删除战斗（阻止冒泡，避免触发展卡点击）
  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // 关键：不让点击事件传到卡片
    console.log('[CombatList] 点击删除按钮，ID:', id);
    if (!window.confirm('确定删除该战斗记录？删除后不可恢复')) return;
    combatStore.delete(id);
    battlegroundStore.delete(id); // 同步清理沙盘数据
  };

  // 导出战斗
  const handleExport = () => {
    combatStore.exportToFile();
  };

  // 导入战斗
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    combatStore.importFromFile(file)
      .then(() => alert('导入成功'))
      .catch(() => alert('导入失败，请检查文件格式'));
    e.target.value = '';
  };

  // 卡片点击跳转（严格用箭头函数绑定，避免渲染时执行）
  const handleCardClick = (recordId: string) => {
    const targetPath = `/combat/${recordId}`;
    console.log('[CombatList] 点击战斗卡片，准备跳转到:', targetPath);
    // 用replace避免路由栈堆积，也可改成{ replace: false }测试
    navigate(targetPath, { replace: false });
  };

  // 非DM直接踢回首页
  if (!isDM) {
    console.log('[CombatList] 非DM用户，跳转首页');
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <FileJson className="w-7 h-7 text-primary" />
            战斗记录
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            共 {records.length} 场战斗记录，支持导入/导出备份
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出全部
          </button>
          <label className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            导入备份
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          <button
            onClick={() => setQuickCreateOpen(true)}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            快速创建
          </button>
        </div>
      </div>

      {/* 战斗列表：卡片整体可点击，删除按钮始终显示 */}
      {records.length === 0 ? (
        <div className="text-center py-12 rounded-xl border-2 border-dashed dark:border-border-dark light:border-border-light">
          <FileJson className="w-16 h-16 mx-auto mb-4 opacity-30 dark:text-text-dark-muted light:text-text-light-muted" />
          <p className="dark:text-text-dark-muted light:text-text-light-muted">暂无战斗记录，点击「快速创建」开始</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(record => (
            <div
              key={record.id}
              // ✅ 严格用箭头函数绑定点击，加cursor-pointer，去掉可能冲突的group类
              onClick={() => handleCardClick(record.id)}
              className="p-4 rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold dark:text-text-dark light:text-text-light truncate hover:text-primary transition-colors">
                    {record.title}
                  </h3>
                  <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted mt-1">
                    参战者：{record.combatants.length}人 | 创建于：{new Date(record.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* ✅ 删除按钮始终显示，hover加深颜色，彻底解决不显示问题 */}
                  <button
                    onClick={(e) => handleDelete(e, record.id)}
                    className="p-2 rounded-lg hover:bg-danger/20 text-danger transition-colors"
                    title="删除战斗记录"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 快速创建战斗弹窗 */}
      <QuickCreateCombatDialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onConfirm={handleQuickCreateConfirm}
      />
    </div>
  );
}
