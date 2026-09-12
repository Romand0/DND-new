import { useState } from 'react';
import { Terminal, Play, Trash2, Plus, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import flowStore from '@/data/flowStore';
import { buildFlowId, parseFlowId, nameToSlug } from '@/types/flow';
import { validateFlowDefinition, validateForPublish } from '@/utils/flow-validation';
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

  const executeConsole = async () => {
    if (!input.trim()) return;

    setExecuting(true);
    setResult(null);

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

            // 处理类别和 ID 更新
            const existingCategory = flowData.category || existing.category || 'custom';
            let id = flowData.id || existing.id;
            
            // 如果类别变更，需要重建 ID 前缀
            if (flowData.category && flowData.category !== existing.category) {
              const slug = nameToSlug(existing.name);
              id = buildFlowId(flowData.category, slug);
            }

            const merged: FlowDefinition = {
              ...existing,
              ...flowData,
              id,
              category: existingCategory,
              updatedAt: Date.now(),
            };

            const validation = validateForPublish(merged);
            if (!validation.valid) {
              failedItems.push({
                name: flowData.name,
                reason: validation.errors.join(', '),
              });
              fail++;
              continue;
            }

            await flowStore.publishDirect(merged);
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
        failedItems: [{ name: '解析错误', reason: '输入不是有效的 JSON 格式' }]
      });
    } finally {
      setExecuting(false);
    }
  };

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
        </div>

        {/* 示例代码 */}
        <div className="mb-4">
          <button
            onClick={() => setInput(mode === 'create' ? exampleCreate : exampleUpdate)}
            className="text-sm text-primary hover:underline"
          >
            {mode === 'create' ? '加载创建示例' : '加载更新示例'}
          </button>
        </div>

        {/* 输入区域 */}
        <div className="mb-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入 JSON 格式的流程数据..."
            className="w-full h-64 p-3 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light dark:text-text-dark light:text-text-light font-mono text-sm"
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={executeConsole}
            disabled={executing || !input.trim()}
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