// src/pages/DataManagement.tsx
import React, { useState } from 'react';
import { ArrowLeft, Download, CheckCircle, AlertCircle, ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createEquipment, updateEquipment, fetchAllEquipments, batchUpsertEquipments, exportAllEquipments, exportAllNpcTemplates, exportAllOptions } from '@/lib/api';
import npcTemplateStore from '@/data/npcTemplateStore';

const CATEGORIES = [
  { key: 'weapons', label: '武器' },
  { key: 'armor', label: '护甲' },
  { key: 'tools', label: '工具' },
  { key: 'adventuring', label: '冒险用品' },
];

const GAME_CATEGORIES = ['武器', '护甲', '药水', '法器', '工具', '法术材料', '卷轴', '杂物'];

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

  // ---- 法术导入状态 ----
const [spellRing, setSpellRing] = useState('0');
const [spellPreview, setSpellPreview] = useState<any[]>([]);
const [spellSelected, setSpellSelected] = useState<Set<string>>(new Set());
const [spellLoading, setSpellLoading] = useState(false);
const [spellImporting, setSpellImporting] = useState(false);
const [spellResult, setSpellResult] = useState<{ success: number; fail: number } | null>(null);
const [showSpellBulkPanel, setShowSpellBulkPanel] = useState(false);
const [spellBulkEditJson, setSpellBulkEditJson] = useState('');
const [spellBulkEditResult, setSpellBulkEditResult] = useState<{
  matched: number;
  unmatched: string[];
  typeErrors: string[];
  unknownFields: string[];
} | null>(null);
// 预览抓取错误提示（此前静默失败：Functions 内 cheerio 超出 Workers 10ms CPU 限额，仅最小的戏法文件能过线）
const [spellError, setSpellError] = useState<string | null>(null);
// 从 JSON 直接导入（绕开预览抓取）：本地脚本 scripts/export-spells-import.mjs 预生成每环 JSON
const [showDirectImport, setShowDirectImport] = useState(false);
const [directImportJson, setDirectImportJson] = useState('');
const [directImporting, setDirectImporting] = useState(false);
const [directImportResult, setDirectImportResult] = useState<{ success: number; fail: number; error?: string } | null>(null);

  // ---- 装备 JSON 直接导入状态（魔法物品等批量 UPSERT）----
const [showEquipDirectImport, setShowEquipDirectImport] = useState(false);
const [equipDirectImportJson, setEquipDirectImportJson] = useState('');
const [equipDirectImporting, setEquipDirectImporting] = useState(false);
const [equipDirectImportResult, setEquipDirectImportResult] = useState<{ success: number; fail: number; error?: string } | null>(null);

  // ---- 法术表格编辑状态 ----
const [spellTableIdentifier, setSpellTableIdentifier] = useState('');

  // ---- 怪物图鉴导入状态 ----
  const [monsterOverwrite, setMonsterOverwrite] = useState(false);
  const [cloudRefreshBusy, setCloudRefreshBusy] = useState(false);
  const [cloudRefreshResult, setCloudRefreshResult] = useState('');
  const [monsterResult, setMonsterResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
const [spellTableContent, setSpellTableContent] = useState('');
const [spellTableSaveResult, setSpellTableSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  // ---- 控制台状态 ----
  const [consoleInput, setConsoleInput] = useState('');
  const [consoleResult, setConsoleResult] = useState<{
    success: number;
    fail: number;
    failedItems: { name: string; reason: string }[];
  } | null>(null);
  const [consoleExecuting, setConsoleExecuting] = useState(false);

  // ---- 种库快照导出状态 ----
  const [seedExporting, setSeedExporting] = useState(false);
  const [seedExportResult, setSeedExportResult] = useState<{
    equipments: number;
    monsters: number;
    options: number;
  } | null>(null);
  const [seedExportError, setSeedExportError] = useState('');

  // 导出三宝书全量快照：?scope=all 取出版物 + 私有，产物是 scripts/build-seed.mjs 的输入
  const handleExportSeedSnapshot = async () => {
    setSeedExporting(true);
    setSeedExportError('');
    setSeedExportResult(null);
    try {
      const [equipments, monsters, options] = await Promise.all([
        exportAllEquipments<any[]>(),
        exportAllNpcTemplates<any[]>(),
        exportAllOptions<any[]>(),
      ]);
      const data = {
        equipments: Array.isArray(equipments) ? equipments : [],
        monsters: Array.isArray(monsters) ? monsters : [],
        options: Array.isArray(options) ? options : [],
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `三宝书种库快照-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSeedExportResult({
        equipments: data.equipments.length,
        monsters: data.monsters.length,
        options: data.options.length,
      });
    } catch (e: any) {
      setSeedExportError(e?.message || String(e));
    } finally {
      setSeedExporting(false);
    }
  };

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

     // ---- 法术导入函数 ----
const fetchSpellPreview = async () => {
  setSpellLoading(true);
  setSpellResult(null);
  setSpellError(null);
  setSpellBulkEditResult(null);
  try {
    const res = await fetch(`/api/import/spells?ring=${spellRing}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setSpellError(`预览失败（HTTP ${res.status}）${text.slice(0, 120)}`);
      setSpellLoading(false);
      return;
    }
    const data = await res.json();
    const items = data.data || [];
    setSpellPreview(items);
    setSpellSelected(new Set(items.map((i: any) => i.id)));
  } catch (err) {
    console.error('获取法术预览失败', err);
    setSpellError(`预览失败：${String(err)}`);
  }
  setSpellLoading(false);
};

// 从 JSON 直接导入：不依赖预览抓取，粘贴 scripts/export-spells-import.mjs 产出的环级 JSON
const confirmDirectImport = async () => {
  setDirectImportResult(null);
  let parsed: unknown;
  try {
    parsed = JSON.parse(directImportJson);
  } catch (e) {
    setDirectImportResult({ success: 0, fail: 0, error: `JSON 解析失败: ${String(e)}` });
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    setDirectImportResult({ success: 0, fail: 0, error: '顶层必须是 JSON 数组且非空' });
    return;
  }
  setDirectImporting(true);
  try {
    const res = await fetch('/api/import/spells', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: parsed }),
    });
    const result = await res.json();
    if (!res.ok) {
      setDirectImportResult({ success: 0, fail: parsed.length, error: result.error ?? `HTTP ${res.status}` });
    } else {
      setDirectImportResult({ success: result.success ?? 0, fail: result.fail ?? 0 });
    }
  } catch (err) {
    setDirectImportResult({ success: 0, fail: parsed.length, error: String(err) });
  }
  setDirectImporting(false);
};

// 装备 JSON 直接导入：批量 UPSERT（魔法物品等），走现有 /equipments 批量端点
const confirmEquipmentDirectImport = async () => {
  setEquipDirectImportResult(null);
  let parsed: unknown;
  try {
    parsed = JSON.parse(equipDirectImportJson);
  } catch (e) {
    setEquipDirectImportResult({ success: 0, fail: 0, error: `JSON 解析失败: ${String(e)}` });
    return;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    setEquipDirectImportResult({ success: 0, fail: 0, error: '顶层必须是 JSON 数组且非空' });
    return;
  }
  const invalid = parsed.findIndex((it: any) => !it || typeof it !== 'object' || !it.id || !it.name);
  if (invalid !== -1) {
    setEquipDirectImportResult({ success: 0, fail: parsed.length, error: `第 ${invalid + 1} 条缺少 id 或 name` });
    return;
  }
  setEquipDirectImporting(true);
  try {
    const result = await batchUpsertEquipments(parsed as any[]);
    setEquipDirectImportResult({ success: result.count ?? parsed.length, fail: 0 });
  } catch (err) {
    setEquipDirectImportResult({ success: 0, fail: parsed.length, error: String(err) });
  }
  setEquipDirectImporting(false);
};

const toggleSpell = (id: string) => {
  setSpellSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const applySpellBulkEdit = () => {
  let parsed: Array<{ id?: string; name?: string; [key: string]: any }>;
  try {
    parsed = JSON.parse(spellBulkEditJson);
  } catch (e) {
    setSpellBulkEditResult({
      matched: 0,
      unmatched: [],
      typeErrors: [`JSON 解析失败: ${String(e)}`],
      unknownFields: [],
    });
    return;
  }
  if (!Array.isArray(parsed)) {
    setSpellBulkEditResult({ matched: 0, unmatched: [], typeErrors: ['顶层必须是 JSON 数组'], unknownFields: [] });
    return;
  }
  const matched: string[] = [];
  const unmatched: string[] = [];
  const typeErrors: string[] = [];
  const unknownFields: string[] = [];
  const updatedPreview = spellPreview.map(i => ({ ...i }));
  parsed.forEach((entry, idx) => {
    const keyField = entry.id || entry.name;
    if (!keyField) {
      unmatched.push(`第 ${idx + 1} 条: 缺 id 或 name`);
      return;
    }
    const targetIdx = updatedPreview.findIndex(i => i.id === keyField || i.name === keyField);
    if (targetIdx === -1) {
      unmatched.push(String(keyField));
      return;
    }
    Object.entries(entry).forEach(([key, val]) => {
      if (key === 'id' || key === 'name') return;
      if (['id', 'name', 'level', 'school'].includes(key)) {
        typeErrors.push(`${keyField}.${key}: 受保护字段，跳过`);
        return;
      }
      (updatedPreview[targetIdx] as any)[key] = val;
    });
    matched.push(keyField);
  });
  setSpellPreview(updatedPreview);
  setSpellBulkEditResult({ matched: matched.length, unmatched, typeErrors, unknownFields });
};

const confirmSpellImport = async () => {
  const itemsToImport = spellPreview.filter(i => spellSelected.has(i.id));
  if (itemsToImport.length === 0) return;
  setSpellImporting(true);
  try {
    const res = await fetch('/api/import/spells', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: itemsToImport }),
    });
    const result = await res.json();
    setSpellResult({ success: result.success ?? 0, fail: result.fail ?? 0 });
  } catch (err) {
    setSpellResult({ success: 0, fail: itemsToImport.length });
  }
  setSpellImporting(false);
};

  // ---- 法术表格编辑函数 ----
const saveSpellTable = async () => {
  setSpellTableSaveResult(null);
  try {
    const res = await fetch('/api/spells/table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: spellTableIdentifier,
        table: spellTableContent,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setSpellTableSaveResult({ success: true, message: `已更新法术「${spellTableIdentifier}」` });
      setSpellTableIdentifier('');
      setSpellTableContent('');
    } else {
      setSpellTableSaveResult({ success: false, message: data.error || '保存失败' });
    }
  } catch (err) {
    setSpellTableSaveResult({ success: false, message: String(err) });
  }
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

const handleMonsterImport = () => {
  const stats = npcTemplateStore.importSeed({ overwrite: monsterOverwrite });
  setMonsterResult(stats);
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

      {/* ====== 区域零：导出三宝书种库快照 ====== */}
      <section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
        <h2 className="text-base font-bold mb-2 dark:text-text-dark light:text-text-light">
          导出三宝书种库快照
        </h2>
        <p className="text-xs mb-3 opacity-60 leading-relaxed">
          拉取装备库、怪物图鉴、角色选项的全量数据（含出版物与自定义），下载为单个 JSON。
          产物交给 <code>scripts/build-seed.mjs</code> 拆分为 <code>public/seed/</code> 中文分片后提交仓库。
          顺序：先导出并发布种子，再清理云端出版物行，避免图鉴空窗。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportSeedSnapshot}
            disabled={seedExporting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {seedExporting ? '导出中...' : '导出种库快照'}
          </button>
        </div>
        {seedExportError && (
          <p className="text-xs text-danger mt-2">导出失败：{seedExportError}</p>
        )}
        {seedExportResult && (
          <p className="text-xs text-success mt-2">
            已导出：装备 {seedExportResult.equipments} 条 · 怪物 {seedExportResult.monsters} 条 · 选项 {seedExportResult.options} 条
          </p>
        )}
      </section>

      {/* ====== 区域一：从 5E 不全书导入 ====== */}
      <section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
        <h2 className="text-base font-bold mb-4 dark:text-text-dark light:text-text-light">
          从 5E 不全书导入_装备
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


      {/* ====== 装备 JSON 直接导入区域 ====== */}
      <section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
        <h2 className="text-base font-bold mb-4 dark:text-text-dark light:text-text-light">
          从 JSON 直接导入_装备
        </h2>
        <div className="rounded-lg border dark:border-border-dark light:border-border-light">
          <button
            onClick={() => setShowEquipDirectImport(!showEquipDirectImport)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left hover:opacity-80"
          >
            {showEquipDirectImport ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            批量导入装备 JSON（同名 id UPSERT）
          </button>
          {showEquipDirectImport && (
            <div className="p-3 border-t dark:border-border-dark/50 light:border-border-light/50 space-y-2">
              <p className="text-xs opacity-60">
                粘贴 <code>scripts/parse-magic-items.mjs</code> 产出的 JSON，按 id UPSERT 覆盖导入；或直接点下方按钮加载仓库内置的城主指南魔法物品（252 条）。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/magic-items-import.json');
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const data = await res.json();
                      setEquipDirectImportJson(JSON.stringify(data));
                    } catch (e) {
                      setEquipDirectImportResult({ success: 0, fail: 0, error: `加载内置数据失败: ${String(e)}` });
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:opacity-80 dark:border-border-dark light:border-border-light"
                >
                  加载内置魔法物品（252 条）
                </button>
              </div>
              <textarea
                value={equipDirectImportJson}
                onChange={(e) => setEquipDirectImportJson(e.target.value)}
                placeholder='[{"id":"magic-xxx","name":"xxx","category":"武器",...}]'
                className="w-full h-32 px-3 py-2 rounded-lg border bg-transparent outline-none font-mono text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
              />
              <button
                onClick={confirmEquipmentDirectImport}
                disabled={equipDirectImporting || equipDirectImportJson.trim().length === 0}
                className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {equipDirectImporting ? '导入中...' : '导入'}
              </button>
              {equipDirectImportResult && (
                <div className="text-xs space-y-1">
                  {equipDirectImportResult.error ? (
                    <p className="text-danger">{equipDirectImportResult.error}</p>
                  ) : (
                    <p className="text-success">
                      成功 {equipDirectImportResult.success} 条，失败 {equipDirectImportResult.fail} 条
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ====== 法术导入区域 ====== */}
<section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
  <h2 className="text-base font-bold mb-4 dark:text-text-dark light:text-text-light">
    从 5E 不全书导入_法术
  </h2>

  <div className="flex items-center gap-3 mb-2">
    <select
      value={spellRing}
      onChange={(e) => setSpellRing(e.target.value)}
      className="px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
    >
      {Object.entries({ '0': '戏法', '1': '1环', '2': '2环', '3': '3环', '4': '4环', '5': '5环', '6': '6环', '7': '7环', '8': '8环', '9': '9环' }).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
    <button
      onClick={fetchSpellPreview}
      disabled={spellLoading}
      className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
    >
      {spellLoading ? '加载中...' : '获取预览'}
    </button>
  </div>

  {spellError && (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{spellError}</span>
    </div>
  )}

  {/* 从 JSON 直接导入：预览抓取受 Workers CPU 限额影响时，用本地脚本预生成的 JSON 绕开 */}
  <div className="mb-4 rounded-lg border dark:border-border-dark light:border-border-light">
    <button
      onClick={() => setShowDirectImport(!showDirectImport)}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left hover:opacity-80"
    >
      {showDirectImport ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      从 JSON 直接导入（预览失败时用此入口）
    </button>
    {showDirectImport && (
      <div className="p-3 border-t dark:border-border-dark/50 light:border-border-light/50 space-y-2">
        <p className="text-xs opacity-60">
          粘贴 <code>scripts/export-spells-import.mjs</code> 产出的环级 JSON（如 spells-import/五环.json），整环覆盖导入（同名 id UPSERT）。
        </p>
        <textarea
          value={directImportJson}
          onChange={(e) => setDirectImportJson(e.target.value)}
          placeholder='[{"id":"bless", "name":"祝福术", ...}]'
          className="w-full h-32 px-3 py-2 rounded-lg border bg-transparent outline-none font-mono text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
        />
        <button
          onClick={confirmDirectImport}
          disabled={directImporting || directImportJson.trim().length === 0}
          className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {directImporting ? '导入中...' : '导入'}
        </button>
        {directImportResult && (
          <div className="text-xs space-y-1">
            {directImportResult.error ? (
              <div className="text-red-500">{directImportResult.error}</div>
            ) : (
              <>
                <div className="text-green-500">导入成功: {directImportResult.success} 条</div>
                {directImportResult.fail > 0 && (
                  <div className="text-yellow-500">失败: {directImportResult.fail} 条</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )}
  </div>

  {/* 批量编辑面板 */}
  {spellPreview.length > 0 && (
    <div className="mb-4 rounded-lg border dark:border-border-dark light:border-border-light">
      <button
        onClick={() => setShowSpellBulkPanel(!showSpellBulkPanel)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left hover:opacity-80"
      >
        {showSpellBulkPanel ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        批量字段编辑（按 id 或 name 匹配覆盖）
      </button>
      {showSpellBulkPanel && (
        <div className="p-3 border-t dark:border-border-dark/50 light:border-border-light/50 space-y-2">
          <p className="text-xs opacity-60">
            格式：<code>[{"{"}"id":"bless", "description":"..."{"}"}]</code>。id/name/level/school 受保护。
          </p>
          <textarea
            value={spellBulkEditJson}
            onChange={(e) => setSpellBulkEditJson(e.target.value)}
            placeholder='[{"id":"bless", "description":"自定义描述..."}]'
            className="w-full h-32 px-3 py-2 rounded-lg border bg-transparent outline-none font-mono text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
          />
          <button
            onClick={applySpellBulkEdit}
            className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:opacity-90"
          >
            应用
          </button>
          {spellBulkEditResult && (
            <div className="text-xs space-y-1">
              <div className="text-green-500">匹配并更新: {spellBulkEditResult.matched} 条</div>
              {spellBulkEditResult.unmatched.length > 0 && (
                <div className="text-yellow-500">未匹配: {spellBulkEditResult.unmatched.join(', ')}</div>
              )}
              {spellBulkEditResult.typeErrors.length > 0 && (
                <div className="text-red-500">类型/保护错误: {spellBulkEditResult.typeErrors.join('; ')}</div>
              )}
              {spellBulkEditResult.unknownFields.length > 0 && (
                <div className="text-blue-500">未知字段: {spellBulkEditResult.unknownFields.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )}

  {spellPreview.length > 0 && (
    <>
      <div className="mb-2 text-sm dark:text-text-dark-muted light:text-text-light-muted">
        共 {spellPreview.length} 条，已选 {spellSelected.size} 条
      </div>
      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              <th className="p-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={spellSelected.size === spellPreview.length}
                  onChange={() => {
                    if (spellSelected.size === spellPreview.length) setSpellSelected(new Set());
                    else setSpellSelected(new Set(spellPreview.map(i => i.id)));
                  }}
                />
              </th>
              <th className="p-2 text-left">名称</th>
              <th className="p-2 text-left">环数</th>
              <th className="p-2 text-left">学派</th>
              <th className="p-2 text-left">施法时间</th>
              <th className="p-2 text-left">距离</th>
              <th className="p-2 text-left">持续时间</th>
              <th className="p-2 text-left">职业</th>
              <th className="p-2 text-left">描述</th>
            </tr>
          </thead>
          <tbody>
            {spellPreview.map((item) => (
              <tr
                key={item.id}
                className="border-t dark:border-border-dark/50 light:border-border-light/50 hover:dark:bg-card-dark/50 hover:light:bg-card-light/50"
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={spellSelected.has(item.id)}
                    onChange={() => toggleSpell(item.id)}
                  />
                </td>
                <td className="p-2 font-medium">{item.name}</td>
                <td className="p-2">{item.level}</td>
                <td className="p-2">{item.school}</td>
                <td className="p-2">{item.castingTime}</td>
                <td className="p-2">{item.range}</td>
                <td className="p-2">{item.duration}</td>
                <td className="p-2 text-xs">{item.classes?.join(', ') || '—'}</td>
                <td className="p-2 text-xs max-w-[200px] truncate" title={item.description}>
                  {item.description || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={confirmSpellImport}
        disabled={spellImporting || spellSelected.size === 0}
        className="mt-4 px-6 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        {spellImporting ? '导入中...' : `导入选中项 (${spellSelected.size})`}
      </button>

      {spellResult && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {(spellResult.fail ?? 0) === 0 ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-yellow-500" />
          )}
          <span>
            成功 {spellResult.success ?? 0} 条
            {(spellResult.fail ?? 0) > 0 ? `，失败 ${spellResult.fail} 条` : ''}
          </span>
        </div>
      )}
    </>
  )}

  {spellPreview.length === 0 && !spellLoading && (
    <div className="text-center py-12 text-sm opacity-50">
      选择一个环数，点击"获取预览"查看可导入的法术
    </div>
  )}
</section>
{/* ====== 法术表格编辑 ====== */}
<section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
  <h2 className="text-base font-bold mb-4 dark:text-text-dark light:text-text-light">
    导入表格
  </h2>
  <div className="space-y-2">
    <input
      type="text"
      placeholder="法术 ID 或名称（如 animate-objects / 活化物件）"
      value={spellTableIdentifier}
      onChange={(e) => setSpellTableIdentifier(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm"
    />
    <textarea
      placeholder={`输入 Wikidot 表格语法，例如：\n|| 体型 || HP || AC || 攻击 || 力量 || 敏捷 ||\n| 微型 | 20 | 18 | 命中+8，伤害 1d4+4 | 4 | 18 |`}
      value={spellTableContent}
      onChange={(e) => setSpellTableContent(e.target.value)}
      rows={6}
      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none font-mono text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
    />
    <button
      onClick={saveSpellTable}
      disabled={!spellTableIdentifier || !spellTableContent}
      className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
    >
      保存
    </button>
    {spellTableSaveResult && (
      <div className={`text-xs ${spellTableSaveResult.success ? 'text-green-500' : 'text-red-500'}`}>
        {spellTableSaveResult.message}
      </div>
    )}
  </div>
</section>

      {/* ====== 怪物图鉴导入 ====== */}
      <section className="rounded-lg border dark:border-border-dark light:border-border-light p-4">
        <h2 className="text-base font-bold mb-4 dark:text-text-dark light:text-text-light">
          怪物图鉴（Monster Manual 2014）
        </h2>
        <div className="space-y-2">
          <p className="text-xs dark:text-text-muted-dark light:text-text-muted-light">
            解析器从《怪物图鉴 2014》产出的 {npcTemplateStore.seedCount()} 条官方怪物模板。
            首次使用已自动预置；手动改动丢失或解析器更新后可在此重新导入。
          </p>
          <label className="flex items-center gap-2 text-sm dark:text-text-dark light:text-text-light">
            <input
              type="checkbox"
              checked={monsterOverwrite}
              onChange={(e) => setMonsterOverwrite(e.target.checked)}
            />
            覆盖已存在模板（默认只补缺失，保留手动改动）
          </label>
          <button
            onClick={handleMonsterImport}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90"
          >
            重新导入图鉴种子
          </button>
          {monsterResult && (
            <div className="text-xs text-green-500">
              新增 {monsterResult.created} / 更新 {monsterResult.updated} / 跳过 {monsterResult.skipped}
            </div>
          )}
          <button
            onClick={async () => {
              setCloudRefreshBusy(true);
              try {
                const r = await npcTemplateStore.reimportSeedsToCloud();
                setCloudRefreshResult(`已覆盖推送 ${r.pushed} 条种子到云端，拉取 ${r.loaded} 条`);
              } catch (err: any) {
                setCloudRefreshResult(`云端刷新失败：${err?.message || '未知错误'}`);
              } finally {
                setCloudRefreshBusy(false);
              }
            }}
            disabled={cloudRefreshBusy}
            className="px-4 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/10 disabled:opacity-50"
          >
            {cloudRefreshBusy ? '云端刷新中…' : '同步种子到云端（覆盖同源模板）'}
          </button>
          {cloudRefreshResult && (
            <div className={cloudRefreshResult.includes('失败') ? 'text-xs text-red-500' : 'text-xs text-green-500'}>
              {cloudRefreshResult}
            </div>
          )}
        </div>
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
