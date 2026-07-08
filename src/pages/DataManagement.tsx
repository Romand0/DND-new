// src/pages/DataManagement.tsx
import React, { useState } from 'react';
import { ArrowLeft, Download, CheckCircle, AlertCircle, ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createEquipment, updateEquipment, fetchAllEquipments } from '@/lib/api';

const CATEGORIES = [
  { key: 'weapons', label: '武器' },
  { key: 'armor', label: '护甲' },
  { key: 'tools', label: '工具' },
  { key: 'adventuring', label: '冒险用品' },
];

const GAME_CATEGORIES = ['武器', '护甲', '药水', '法器', '工具', '杂物'];

const IMPORT_CAT_TO_GAME: Record<string, string> = {
  weapons: '武器',
  armor: '护甲',
  tools: '工具',
};

interface PreviewItem {
  id: string;
  name: string;
  category: string;
  price: { amount: number; unit: string };
  weight: number;
  damageDice?: string;
  damageType?: string;
  acBase?: string;
  subtype?: string;
  properties?: string[];
  description?: string;
}

const FIELD_TYPES: Record<string, 'string' | 'number' | 'object' | 'array' | 'boolean'> = {
  price: 'object',
  weight: 'number',
  damageDice: 'string',
  damageType: 'string',
  acBase: 'string',
  subtype: 'string',
  properties: 'array',
  description: 'string',
};

const PROTECTED_FIELDS = new Set(['id', 'name', 'category']);

export default function DataManagement() {
  const navigate = useNavigate();

  // ---- 导入区状态 ----
  const [category, setCategory] = useState('weapons');
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; fail: number } | null>(null);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkEditJson, setBulkEditJson] = useState('');
  const [bulkEditResult, setBulkEditResult] = useState<{
    matched: number;
    unmatched: string[];
    typeErrors: string[];
    unknownFields: string[];
  } | null>(null);

  // ---- 控制台状态 ----
  const [consoleInput, setConsoleInput] = useState('');
  const [consoleResult, setConsoleResult] = useState<{
    success: number;
    fail: number;
    failedItems: { name: string; reason: string }[];
  } | null>(null);
  const [consoleExecuting, setConsoleExecuting] = useState(false);

  // ---- 导入区函数 ----
  const fetchPreview = async () => {
    setLoading(true);
    setResult(null);
    setBulkEditResult(null);
    try {
      const res = await fetch(`/api/import/equipments?category=${category}`);
      const data = await res.json();
      const items = data.data || [];
      setPreview(items);
      setSelected(new Set(items.map((i: PreviewItem) => i.id)));

      const overrides: Record<string, string> = {};
      items.forEach((item: PreviewItem) => {
        overrides[item.id] = IMPORT_CAT_TO_GAME[item.category] || '杂物';
      });
      setCategoryOverrides(overrides);

      let existing: any[];
      try {
        existing = await fetchAllEquipments();
      } catch {
        existing = [];
      }
      const names = new Set(existing.map((e: any) => e.name));
      setExistingNames(names);
    } catch (err) {
      console.error('获取预览失败', err);
    }
    setLoading(false);
  };

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateCategoryOverride = (id: string, newCategory: string) => {
    setCategoryOverrides(prev => ({ ...prev, [id]: newCategory }));
  };

  const applyBulkEdit = () => {
    let parsed: Array<{ name: string; [key: string]: any }>;
    try {
      parsed = JSON.parse(bulkEditJson);
    } catch (e) {
      setBulkEditResult({
        matched: 0,
        unmatched: [],
        typeErrors: [`JSON 解析失败: ${String(e)}`],
        unknownFields: [],
      });
      return;
    }

    if (!Array.isArray(parsed)) {
      setBulkEditResult({
        matched: 0,
        unmatched: [],
        typeErrors: ['顶层必须是 JSON 数组'],
        unknownFields: [],
      });
      return;
    }

    const matched: string[] = [];
    const unmatched: string[] = [];
    const typeErrors: string[] = [];
    const unknownFields: string[] = [];
    const updatedPreview = preview.map(i => ({ ...i }));

    parsed.forEach((entry, idx) => {
      if (!entry.name) {
        unmatched.push(`第 ${idx + 1} 条: 缺 name 字段`);
        return;
      }
      const targetIdx = updatedPreview.findIndex(i => i.name === entry.name);
      if (targetIdx === -1) {
        unmatched.push(entry.name);
        return;
      }

      Object.entries(entry).forEach(([key, val]) => {
        if (key === 'name') return;
        if (PROTECTED_FIELDS.has(key)) return;

        const expectedType = FIELD_TYPES[key];
        if (expectedType) {
          const actual = Array.isArray(val) ? 'array' : typeof val;
          if (actual !== expectedType) {
            typeErrors.push(`${entry.name}.${key}: 期望 ${expectedType}，收到 ${actual}`);
            return;
          }
        } else {
          unknownFields.push(`${entry.name}.${key}`);
        }

        (updatedPreview[targetIdx] as any)[key] = val;
      });

      matched.push(entry.name);
    });

    setPreview(updatedPreview);
    setBulkEditResult({ matched: matched.length, unmatched, typeErrors, unknownFields });
  };

  const confirmImport = async () => {
    const itemsToImport = preview
      .filter(i => selected.has(i.id))
      .map(i => ({
        ...i,
        category: categoryOverrides[i.id] || i.category,
      }));

    if (itemsToImport.length === 0) return;

    setImporting(true);
    let success = 0;
    let fail = 0;

    let remoteList: any[] = [];
    try {
      remoteList = await fetchAllEquipments();
    } catch {}
    const nameToId = new Map(remoteList.map((e: any) => [e.name, e.id]));

    for (const item of itemsToImport) {
      try {
        const equipmentItem = {
          id: nameToId.get(item.name) || item.id,
          name: item.name,
          category: item.category,
          price: {
            amount: item.price.amount,
            unit: item.price.unit as 'gp' | 'sp' | 'cp',
          },
          weight: item.weight,
          damageDice: item.damageDice,
          damageType: item.damageType,
          acBase: item.acBase,
          subtype: item.subtype,
          properties: item.properties,
          description: item.description,
          isCustom: false,
          tags: [],
        };

        if (nameToId.has(item.name)) {
          await updateEquipment(nameToId.get(item.name)!, equipmentItem);
        } else {
          await createEquipment(equipmentItem);
        }
        success++;
      } catch (err) {
        fail++;
      }
    }

    setResult({ success, fail });

    try {
      const refreshed = await fetchAllEquipments();
      setExistingNames(new Set(refreshed.map((e: any) => e.name)));
    } catch {}

    setImporting(false);
  };

  // ---- 控制台函数 ----
  const executeConsole = async () => {
  let parsed: Array<{ name: string; [key: string]: any }>;
  try {
    parsed = JSON.parse(consoleInput);
  } catch (e) {
    alert('JSON 解析失败');
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    alert('请输入至少一条有效数据');
    return;
  }

  setConsoleExecuting(true);
  setConsoleResult(null);

  let remoteList: any[] = [];
  try {
    remoteList = await fetchAllEquipments();
  } catch {}
  const nameToId = new Map(remoteList.map((e: any) => [e.name, e.id]));
  // 建立 name → 完整装备对象的映射，用于更新时保留未提供的字段
  const nameToFull = new Map(remoteList.map((e: any) => [e.name, e]));

  let success = 0;
  let fail = 0;
  const failedItems: { name: string; reason: string }[] = [];

  for (const entry of parsed) {
    if (!entry.name) {
      failedItems.push({ name: '(无名)', reason: '缺少 name 字段' });
      fail++;
      continue;
    }

    try {
      let equipmentItem: any;

      if (nameToId.has(entry.name)) {
        // 更新已有装备：基于现有数据，用 entry 覆盖
        const existing = nameToFull.get(entry.name)!;
        equipmentItem = {
          id: existing.id,
          name: entry.name,
          category: entry.category ?? existing.category,
          price: entry.price ?? existing.price,
          weight: entry.weight ?? existing.weight,
          damageDice: entry.damageDice ?? existing.damageDice,
          damageType: entry.damageType ?? existing.damageType,
          acBase: entry.acBase ?? existing.acBase,
          subtype: entry.subtype ?? existing.subtype,
          properties: entry.properties ?? existing.properties,
          description: entry.description ?? existing.description,
          isCustom: existing.isCustom ?? false,
          tags: entry.tags ?? existing.tags ?? [],
        };
        await updateEquipment(existing.id, equipmentItem);
      } else {
        // 新建装备：使用默认值，但允许 entry 覆盖
        equipmentItem = {
          id: entry.name.toLowerCase().replace(/\s+/g, '-'),
          name: entry.name,
          category: entry.category || '杂物',
          price: entry.price || { amount: 0, unit: 'gp' },
          weight: entry.weight ?? 0,
          damageDice: entry.damageDice,
          damageType: entry.damageType,
          acBase: entry.acBase,
          subtype: entry.subtype,
          properties: entry.properties || [],
          description: entry.description || '',
          isCustom: false,
          tags: [],
        };
        await createEquipment(equipmentItem);
      }
      success++;
    } catch (err: any) {
      failedItems.push({ name: entry.name, reason: err.message || '未知错误' });
      fail++;
    }
  }

  setConsoleResult({ success, fail, failedItems });
  setConsoleExecuting(false);
};

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto space-y-8">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm mb-4 hover:opacity-80"
      >
        <ArrowLeft className="w-4 h-4" />
        返回
      </button>

      <h1 className="text-xl font-bold mb-4">数据管理</h1>

      {/* ====== 区域一：从 5E 不全书导入 ====== */}
      <section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
        <h2 className="text-base font-bold mb-4 dark:text-text-dark light:text-text-light">
          从 5E 不全书导入
        </h2>

        {/* 品类选择 + 获取预览 */}
        <div className="flex items-center gap-3 mb-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
          >
            {CATEGORIES.map(cat => (
              <option key={cat.key} value={cat.key}>{cat.label}</option>
            ))}
          </select>
          <button
            onClick={fetchPreview}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '加载中...' : '获取预览'}
          </button>
        </div>

        {/* 批量字段编辑面板 */}
        {preview.length > 0 && (
          <div className="mb-4 rounded-lg border dark:border-border-dark light:border-border-light">
            <button
              onClick={() => setShowBulkPanel(!showBulkPanel)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left hover:opacity-80"
            >
              {showBulkPanel ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              批量字段编辑（粘贴 JSON 按名称匹配覆盖字段）
            </button>
            {showBulkPanel && (
              <div className="p-3 border-t dark:border-border-dark/50 light:border-border-light/50 space-y-2">
                <p className="text-xs opacity-60">
                  格式：<code>[{"{"}"name":"皮甲", "description":"..."{"}"}]</code>。除 name 外所有字段动态覆盖，id/name/category 受保护。
                </p>
                <textarea
                  value={bulkEditJson}
                  onChange={(e) => setBulkEditJson(e.target.value)}
                  placeholder='[{"name":"皮甲", "description":"皮甲由数层布料与棉料的衬里构成..."}]'
                  className="w-full h-32 px-3 py-2 rounded-lg border bg-transparent outline-none font-mono text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
                />
                <button
                  onClick={applyBulkEdit}
                  className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90"
                >
                  应用
                </button>

                {bulkEditResult && (
                  <div className="text-xs space-y-1">
                    <div className="text-green-500">匹配并更新: {bulkEditResult.matched} 条</div>
                    {bulkEditResult.unmatched.length > 0 && (
                      <div className="text-yellow-500">未匹配（name 找不到）: {bulkEditResult.unmatched.join(', ')}</div>
                    )}
                    {bulkEditResult.typeErrors.length > 0 && (
                      <div className="text-red-500">类型错误: {bulkEditResult.typeErrors.join('; ')}</div>
                    )}
                    {bulkEditResult.unknownFields.length > 0 && (
                      <div className="text-blue-500">未知字段（已覆盖，未来可规范化）: {bulkEditResult.unknownFields.join(', ')}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {preview.length > 0 && (
          <>
            <div className="mb-2 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              共 {preview.length} 条，已选 {selected.size} 条
            </div>
            <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
              <table className="w-full text-sm">
                <thead>
                  <tr className="dark:bg-card-dark light:bg-card-light">
                    <th className="p-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === preview.length}
                        onChange={() => {
                          if (selected.size === preview.length) setSelected(new Set());
                          else setSelected(new Set(preview.map(i => i.id)));
                        }}
                      />
                    </th>
                    <th className="p-2 text-left">名称</th>
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">价格</th>
                    <th className="p-2 text-left">重量</th>
                    <th className="p-2 text-left">伤害/AC</th>
                    <th className="p-2 text-left">子分类</th>
                    <th className="p-2 text-left">描述</th>
                    <th className="p-2 text-left">目标分类</th>
                    <th className="p-2 text-left">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t dark:border-border-dark/50 light:border-border-light/50 hover:dark:bg-card-dark/50 hover:light:bg-card-light/50"
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                        />
                      </td>
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2 text-xs opacity-70">{item.id}</td>
                      <td className="p-2">{item.price.amount} {item.price.unit}</td>
                      <td className="p-2">{item.weight} 磅</td>
                      <td className="p-2">
                        {item.damageDice ? `${item.damageDice} ${item.damageType || ''}` : ''}
                        {item.acBase ? `AC ${item.acBase}` : ''}
                      </td>
                      <td className="p-2 text-xs">{item.subtype || '—'}</td>
                      <td className="p-2 text-xs max-w-[200px] truncate" title={item.description}>
                        {item.description || '—'}
                      </td>
                      <td className="p-2">
                        <select
                          value={categoryOverrides[item.id] || item.category}
                          onChange={(e) => updateCategoryOverride(item.id, e.target.value)}
                          className="px-1 py-0.5 text-xs rounded border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
                        >
                          {GAME_CATEGORIES.map(gc => (
                            <option key={gc} value={gc}>{gc}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        {existingNames.has(item.name) ? (
                          <span className="text-yellow-500 text-xs">已存在</span>
                        ) : (
                          <span className="text-green-500 text-xs">新</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={confirmImport}
              disabled={importing || selected.size === 0}
              className="mt-4 px-6 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {importing ? '导入中...' : `导入选中项 (${selected.size})`}
            </button>

            {result && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                {(result.fail ?? 0) === 0 ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                )}
                <span>
                  成功 {result.success ?? 0} 条
                  {(result.fail ?? 0) > 0 ? `，失败 ${result.fail} 条` : ''}
                </span>
              </div>
            )}
          </>
        )}

        {preview.length === 0 && !loading && (
          <div className="text-center py-12 text-sm opacity-50">
            选择一个品类，点击"获取预览"查看可导入的数据
          </div>
        )}
      </section>

      {/* ====== 区域二：控制台 ====== */}
      <section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
        <h2 className="text-base font-bold mb-4 dark:text-text-dark light:text-text-light flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          控制台（直接入库）
        </h2>

        <div className="space-y-2">
          <textarea
            value={consoleInput}
            onChange={(e) => setConsoleInput(e.target.value)}
            placeholder='[{"name":"钢甲","category":"护甲","acBase":18,"weight":40}]'
            className="w-full h-24 px-3 py-2 rounded-lg border bg-transparent outline-none font-mono text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
          />
          <button
            onClick={executeConsole}
            disabled={consoleExecuting || !consoleInput.trim()}
            className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {consoleExecuting ? '执行中...' : '执行'}
          </button>

          {consoleResult && (
            <div className="text-xs space-y-1">
              <div className={consoleResult.fail === 0 ? 'text-green-500' : 'text-yellow-500'}>
                成功 {consoleResult.success} 条，失败 {consoleResult.fail} 条
              </div>
              {consoleResult.failedItems.length > 0 && (
                <div className="text-red-500 space-y-0.5">
                  {consoleResult.failedItems.map((fi, idx) => (
                    <div key={idx}>{fi.name}: {fi.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
