import { useState, useEffect } from 'react';
import { Terminal, Play, Trash2, Plus, CheckCircle, AlertCircle, Loader2, X, BookOpen, Link, Unlink } from 'lucide-react';
import flowStore from '@/data/flowStore';
import { buildFlowId, parseFlowId, nameToSlug } from '@/types/flow';
import { validateFlowDefinition, validateForPublish } from '@/utils/flow-validation';
import { BindingService } from '@/services/bindingService';
import { spellStore } from '@/data/spellStore';
import type { FlowDefinition } from '@/types/flow';

interface ConsoleResult {
  success: number;
  fail: number;
  failedItems: { name: string; reason: string }[];
}

interface Props {
  onClose: () => void;
}

export default function FlowConsole({ onClose }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [mode, setMode] = useState<'create' | 'update' | 'delete'>('create');
  const [showBinding, setShowBinding] = useState(false);
  const [selectedFlowName, setSelectedFlowName] = useState('');
  const [bindingResult, setBindingResult] = useState<{ success: string; error: string } | null>(null);

  const executeConsole = async () => {
    if (!input.trim()) return;

    setExecuting(true);
    setResult(null);
    setBindingResult(null);

    try {
      const parsed = JSON.parse(input);
      const flows = Array.isArray(parsed) ? parsed : [parsed];

      let success = 0;
      let fail = 0;
      const failedItems: { name: string; reason: string }[] = [];

      // 控制台直写发布态：按名称在已发布库中查找
      const publishedList = flowStore.getAllPublished();
      const nameToFlow = new Map(publishedList.map(f => [f.name, f]));

      for (const flowData of flows) {
        try {
          if (!flowData.name) {
            failedItems.push({ name: '(无名)', reason: '缺少 name 字段' });
            fail++;
            continue;
          }

          if (mode === 'create') {
            // 创建：需要完整代码，直接写入发布态
            if (nameToFlow.has(flowData.name)) {
              failedItems.push({
                name: flowData.name,
                reason: '同名流程已存在，请使用更新模式',
              });
              fail++;
              continue;
            }

            const now = Date.now();
            
            // 处理类别和 ID
            const category = flowData.category || 'custom'; // 默认类别
            let id = flowData.id;
            
            // 如果没有提供 ID，自动生成合格 ID
            if (!id) {
              id = buildFlowId(category, nameToSlug(flowData.name));
            }
            
            // 验证 ID 前缀与类别一致
            const { category: parsedCategory } = parseFlowId(id);
            if (parsedCategory !== category) {
              failedItems.push({
                name: flowData.name,
                reason: `ID 前缀与类别不一致：ID 为 ${id}（${parsedCategory}），类别为 ${category}`,
              });
              fail++;
              continue;
            }

            const newFlow: FlowDefinition = {
              id,
              name: flowData.name,
              category,
              description: flowData.description ?? '',
              nodes: flowData.nodes ?? [],
              edges: flowData.edges ?? [],
              tags: flowData.tags ?? [],
              version: 1,
              status: 'published',
              createdAt: now,
              updatedAt: now,
            };

            const validation = validateForPublish(newFlow);
            if (!validation.valid) {
              failedItems.push({
                name: flowData.name,
                reason: validation.errors.join(', '),
              });
              fail++;
              continue;
            }

            await flowStore.publishDirect(newFlow);
            success++;
          } else if (mode === 'update') {
            // 更新：变量名（name）+ 修改后内容，合并后重新通过验证
            const existing = nameToFlow.get(flowData.name);
            if (!existing) {
              failedItems.push({
                name: flowData.name,
                reason: '已发布库中不存在该流程，请使用创建模式',
              });
              fail++;
              continue;
            }

            // 处理类别和 ID
            const category = flowData.category || existing.category || 'custom';
            let id = flowData.id || existing.id;
            
            // 如果提供了类别且与原类别不同，需要重建 ID
            if (flowData.category && flowData.category !== existing.category) {
              id = buildFlowId(category, nameToSlug(flowData.name));
            }
            
            // 验证 ID 前缀与类别一致
            const { category: parsedCategory } = parseFlowId(id);
            if (parsedCategory !== category) {
              failedItems.push({
                name: flowData.name,
                reason: `ID 前缀与类别不一致：ID 为 ${id}（${parsedCategory}），类别为 ${category}`,
              });
              fail++;
              continue;
            }

            const updatedFlow: FlowDefinition = {
              ...existing,
              id,
              name: flowData.name || existing.name,
              category,
              description: flowData.description ?? existing.description,
              nodes: flowData.nodes ?? existing.nodes,
              edges: flowData.edges ?? existing.edges,
              tags: flowData.tags ?? existing.tags,
              version: (existing.version || 1) + 1,
              updatedAt: Date.now(),
            };

            const validation = validateForPublish(updatedFlow);
            if (!validation.valid) {
              failedItems.push({
                name: flowData.name,
                reason: validation.errors.join(', '),
              });
              fail++;
              continue;
            }

            await flowStore.publishDirect(updatedFlow);
            success++;
          } else if (mode === 'delete') {
            // 删除：仅需变量名（name），从发布态撤下
            const existing = nameToFlow.get(flowData.name);
            if (!existing) {
              failedItems.push({
                name: flowData.name,
                reason: '已发布库中不存在该流程',
              });
              fail++;
              continue;
            }

            await flowStore.unpublish(existing.id);
            success++;
          }
        } catch (err: any) {
          failedItems.push({ 
            name: flowData.name, 
            reason: err.message || '未知错误' 
          });
          fail++;
        }
      }

      setResult({ success, fail, failedItems });
    } catch (err) {
      setResult({
        success: 0,
        fail: 1,
        failedItems: [{ name: '(全局)', reason: err instanceof Error ? err.message : '未知错误' }],
      });
    } finally {
      setExecuting(false);
    }
  };

  // 法术绑定/解绑功能
  const handleBindingAction = async (action: 'bind' | 'unbind', flowName: string, spellId: string) => {
    try {
      const publishedList = flowStore.getAllPublished();
      const flow = publishedList.find(f => f.name === flowName);
      
      if (!flow) {
        setBindingResult({ success: '', error: `未找到流程: ${flowName}` });
        return;
      }

      if (action === 'bind') {
        await BindingService.bindSpellToFlow(spellId, flow.id);
        setBindingResult({ success: `法术已绑定到流程: ${flowName}`, error: '' });
      } else {
        // 解绑需要先找到绑定关系
        const bindings = await BindingService.getFlowBoundSpells(flow.id);
        const binding = bindings.find(b => b.id === spellId);
        if (binding) {
          await BindingService.unbindSpellFromFlow(binding.id);
          setBindingResult({ success: `法术已从流程解绑: ${flowName}`, error: '' });
        } else {
          setBindingResult({ success: '', error: `未找到该绑定关系` });
        }
      }
    } catch (error) {
      setBindingResult({ success: '', error: `${action === 'bind' ? '绑定' : '解绑'}失败: ${error instanceof Error ? error.message : '未知错误'}` });
    }
  };

  // 获取可用法术列表
  const getAvailableSpells = () => {
    return spellStore.getAll();
  };

  // 获取流程已绑定的法术
  const getFlowBoundSpells = async (flowName: string) => {
    const publishedList = flowStore.getAllPublished();
    const flow = publishedList.find(f => f.name === flowName);
    if (!flow) return [];
    return await BindingService.getFlowBoundSpells(flow.id);
  };

  // 组件状态：已绑定和可选法术
  const [boundSpells, setBoundSpells] = useState<any[]>([]);
  const [availableSpells, setAvailableSpells] = useState<any[]>([]);
  const [loadingSpells, setLoadingSpells] = useState(false);

  // 当选择的流程改变时，加载绑定信息
  useEffect(() => {
    if (selectedFlowName) {
      const loadSpells = async () => {
        setLoadingSpells(true);
        try {
          const bound = await getFlowBoundSpells(selectedFlowName);
          setBoundSpells(bound);
          const allSpells = spellStore.getAll();
          const unbound = allSpells.filter(spell => !bound.some(b => b.id === spell.id));
          setAvailableSpells(unbound);
        } catch (error) {
          console.error('加载法术信息失败:', error);
        } finally {
          setLoadingSpells(false);
        }
      };
      loadSpells();
    } else {
      setBoundSpells([]);
      setAvailableSpells([]);
    }
  }, [selectedFlowName]);

  const clearInput = () => {
    setInput('');
    setResult(null);
  };

  const exampleCreate = `{
   "id": "spell:example_flow",
   "name": "示例流程",
   "category": "spell",
   "description": "这是一个示例流程",
   "nodes": [
     {
       "id": "start",
       "type": "cast_start",
       "label": "开始",
       "position": { "x": 100, "y": 100 }
     },
     {
       "id": "end",
       "type": "cast_end",
       "label": "结束",
       "position": { "x": 300, "y": 100 }
     }
   ],
   "edges": [
     {
       "id": "edge1",
       "from": "start",
       "to": "end",
       "trigger": "on_complete"
     }
   ],
   "tags": ["示例"]
 }`;

  const exampleUpdate = `{
   "name": "现有流程名称",
   "description": "更新后的描述"
 }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            流程控制台
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 模式选择 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('create')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-primary text-white'
                : 'dark:bg-white/10 light:bg-gray-100 dark:text-text-dark light:text-text-light'
            }`}
          >
            <Plus className="w-4 h-4 inline mr-1" />
            创建
          </button>
          <button
            onClick={() => setMode('update')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              mode === 'update'
                ? 'bg-primary text-white'
                : 'dark:bg-white/10 light:bg-gray-100 dark:text-text-dark light:text-text-light'
            }`}
          >
            <CheckCircle className="w-4 h-4 inline mr-1" />
            更新
          </button>
          <button
            onClick={() => setMode('delete')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              mode === 'delete'
                ? 'bg-red-500 text-white'
                : 'dark:bg-white/10 light:bg-gray-100 dark:text-text-dark light:text-text-light'
            }`}
          >
            <Trash2 className="w-4 h-4 inline mr-1" />
            删除
          </button>
          <button
            onClick={() => setShowBinding(!showBinding)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              showBinding
                ? 'bg-green-500 text-white'
                : 'dark:bg-white/10 light:bg-gray-100 dark:text-text-dark light:text-text-light'
            }`}
          >
            <BookOpen className="w-4 h-4 inline mr-1" />
            法术绑定
          </button>
        </div>

        {/* 示例代码 */}
        <div className="mb-4">
          <button
            onClick={() => setInput(mode === 'create' ? exampleCreate : exampleUpdate)}
            className="text-sm text-primary hover:underline"
          >
            {mode === 'create' ? '载入创建示例' : '载入更新示例'}
          </button>
        </div>

        {/* 输入区域 */}
        <div className="mb-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === 'create' 
              ? '输入流程定义 JSON（包含 id、name、category、nodes、edges）' 
              : mode === 'update' 
                ? '输入要更新的字段（如 {"name": "新名称", "description": "新描述"}）'
                : '输入要删除的流程名称（如 {"name": "流程名称"}）'
            }
            className="w-full h-40 p-3 border dark:border-border-dark light:border-border-light rounded-lg bg-white dark:bg-gray-700 font-mono text-sm dark:text-text-dark light:text-text-light"
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={executeConsole}
            disabled={executing}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {executing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                执行
              </>
            )}
          </button>
          <button
            onClick={clearInput}
            className="px-4 py-2 border dark:border-border-dark light:border-border-light rounded-lg font-medium hover:bg-white/5"
          >
            清空
          </button>
        </div>

        {/* 结果显示 */}
        {result && (
          <div className="border dark:border-border-dark light:border-border-light rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {result.fail === 0 ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-medium">
                成功 {result.success} 个，失败 {result.fail} 个
              </span>
            </div>

            {result.failedItems.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-red-500">失败项目：</h4>
                {result.failedItems.map((item, index) => (
                  <div key={index} className="text-sm dark:text-text-dark light:text-text-light">
                    <span className="font-medium">{item.name}:</span> {item.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 法术绑定/解绑面板 */}
        {showBinding && (
          <div className="mt-6 border dark:border-border-dark light:border-border-light rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              法术绑定管理
            </h3>
            
            {/* 流程选择 */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">选择流程：</label>
              <select
                value={selectedFlowName}
                onChange={(e) => setSelectedFlowName(e.target.value)}
                className="w-full px-3 py-2 border dark:border-border-dark light:border-border-light rounded-lg bg-white dark:bg-gray-700"
              >
                <option value="">请选择流程</option>
                {flowStore.getAllPublished().map(flow => (
                  <option key={flow.id} value={flow.name}>
                    {flow.name} ({flow.category})
                  </option>
                ))}
              </select>
            </div>

            {/* 绑定结果 */}
            {bindingResult && (bindingResult.success || bindingResult.error) && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                bindingResult.success 
                  ? 'bg-green-50 border border-green-200 text-green-700' 
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {bindingResult.success && <p className="font-medium">{bindingResult.success}</p>}
                {bindingResult.error && <p className="font-medium">{bindingResult.error}</p>}
              </div>
            )}

            {/* 已绑定法术 */}
            {selectedFlowName && (
              <div className="mb-4">
                <h4 className="font-medium mb-2">已绑定法术：</h4>
                <div className="space-y-2">
                  {loadingSpells ? (
                    <div className="text-sm text-gray-500">加载中...</div>
                  ) : boundSpells.length === 0 ? (
                    <p className="text-sm text-gray-500">暂无绑定法术</p>
                  ) : (
                    boundSpells.map(spell => (
                      <div key={spell.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <div>
                          <span className="font-medium">{spell.name}</span>
                          <span className="text-sm text-gray-500 ml-2">
                            {spell.level}环 {spell.school}
                          </span>
                        </div>
                        <button
                          onClick={() => handleBindingAction('unbind', selectedFlowName, spell.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                        >
                          <Unlink className="w-4 h-4 inline mr-1" />
                          解绑
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 可选法术 */}
            {selectedFlowName && (
              <div>
                <h4 className="font-medium mb-2">可选法术：</h4>
                <div className="space-y-2">
                  {loadingSpells ? (
                    <div className="text-sm text-gray-500">加载中...</div>
                  ) : availableSpells.length === 0 ? (
                    <p className="text-sm text-gray-500">所有法术均已绑定</p>
                  ) : (
                    availableSpells.map(spell => (
                      <div key={spell.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <div>
                          <span className="font-medium">{spell.name}</span>
                          <span className="text-sm text-gray-500 ml-2">
                            {spell.level}环 {spell.school}
                          </span>
                        </div>
                        <button
                          onClick={() => handleBindingAction('bind', selectedFlowName, spell.id)}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                        >
                          <Link className="w-4 h-4 inline mr-1" />
                          绑定
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 使用说明 */}
        <div className="mt-4 text-xs dark:text-text-dark-muted light:text-text-light-muted">
          <p className="mb-1"><strong>创建模式：</strong>输入完整的流程定义（包含 id、category、name、nodes、edges 等必填字段）</p>
          <p className="mb-1"><strong>更新模式：</strong>只需输入要更新的字段（如 name、description、category），其他字段保持不变</p>
          <p><strong>删除模式：</strong>只需输入流程的 name 字段</p>
        </div>
      </div>
    </div>
  );
}