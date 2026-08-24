import React, { useState, useEffect } from 'react';
import { Trash2, Search, RefreshCw, Edit, AlertTriangle } from 'lucide-react';

interface LocalStorageData {
  key: string;
  value: any;
  size: number;
}

interface DraftData {
  parentId: string;
  data: any;
  createdAt: number;
  updatedAt: number;
}

export default function LocalStorageManager() {
  const [localStorageData, setLocalStorageData] = useState<LocalStorageData[]>([]);
  const [draftsData, setDraftsData] = useState<DraftData[]>([]);
  const [publishedData, setPublishedData] = useState<any[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // 读取LocalStorage数据
  const readLocalStorage = () => {
    const data: LocalStorageData[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            data.push({
              key,
              value: parsed,
              size: new Blob([value]).size
            });
          } catch {
            data.push({
              key,
              value,
              size: new Blob([value]).size
            });
          }
        }
      }
    }
    setLocalStorageData(data);
  };

  // 读取草稿数据
  const readDrafts = () => {
    try {
      const raw = localStorage.getItem('dnd-flow-drafts');
      const drafts = raw ? JSON.parse(raw) : [];
      setDraftsData(drafts);
    } catch (error) {
      console.error('读取草稿数据失败:', error);
    }
  };

  // 读取已发布数据
  const readPublished = () => {
    try {
      const raw = localStorage.getItem('dnd-flow-published');
      const published = raw ? JSON.parse(raw) : [];
      setPublishedData(published);
    } catch (error) {
      console.error('读取已发布数据失败:', error);
    }
  };

  // 初始化读取
  useEffect(() => {
    readLocalStorage();
    readDrafts();
    readPublished();
  }, []);

  // 清理指定键的数据
  const clearKey = (key: string) => {
    try {
      localStorage.removeItem(key);
      readLocalStorage();
      readDrafts();
      readPublished();
      setMessage({ type: 'success', text: `已清理 ${key}` });
    } catch (error) {
      setMessage({ type: 'error', text: `清理失败: ${error}` });
    }
  };

  // 重命名草稿ID
  const renameDraftId = () => {
    if (!selectedDraft || !newId) {
      setMessage({ type: 'warning', text: '请选择草稿并输入新ID' });
      return;
    }

    const draftIndex = draftsData.findIndex(d => d.parentId === selectedDraft);
    if (draftIndex === -1) {
      setMessage({ type: 'error', text: '找不到选中的草稿' });
      return;
    }

    // 检查新ID是否已存在
    const idExists = draftsData.some(d => d.parentId === newId) || 
                    publishedData.some(f => f.id === newId);
    
    if (idExists) {
      setMessage({ type: 'error', text: '新ID已存在，请使用其他ID' });
      return;
    }

    try {
      // 更新草稿数据
      const updatedDrafts = [...draftsData];
      updatedDrafts[draftIndex] = {
        ...updatedDrafts[draftIndex],
        parentId: newId,
        updatedAt: Date.now()
      };
      
      localStorage.setItem('dnd-flow-drafts', JSON.stringify(updatedDrafts));
      
      // 重新读取数据
      readDrafts();
      setSelectedDraft(null);
      setNewId('');
      setMessage({ type: 'success', text: `草稿ID已重命名为 ${newId}` });
    } catch (error) {
      setMessage({ type: 'error', text: `重命名失败: ${error}` });
    }
  };

  // 清理所有草稿
  const clearAllDrafts = () => {
    if (!confirm('确定要清理所有草稿数据吗？此操作不可恢复。')) {
      return;
    }
    
    try {
      localStorage.removeItem('dnd-flow-drafts');
      readDrafts();
      setMessage({ type: 'success', text: '已清理所有草稿数据' });
    } catch (error) {
      setMessage({ type: 'error', text: `清理失败: ${error}` });
    }
  };

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 格式化时间
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">LocalStorage 草稿管理</h1>
          <p className="text-gray-600">查看、清理和重命名草稿数据</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={readLocalStorage}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            刷新数据
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 border border-green-200' :
          message.type === 'error' ? 'bg-red-50 border border-red-200' :
          'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
            {message.type === 'error' && <div className="w-2 h-2 bg-red-500 rounded-full"></div>}
            {message.type === 'warning' && <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>}
            <span className="font-medium">{message.text}</span>
          </div>
        </div>
      )}

      {/* 草稿数据卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Edit className="w-5 h-5" />
            <h3 className="text-lg font-semibold">草稿数据 ({draftsData.length})</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">当前存储的草稿数据</p>
          {draftsData.length === 0 ? (
            <p className="text-gray-500">暂无草稿数据</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {draftsData.map((draft, index) => (
                <div
                  key={index}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedDraft === draft.parentId ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedDraft(draft.parentId)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">ID: {draft.parentId}</div>
                      <div className="text-sm text-gray-600">
                        更新: {formatDate(draft.updatedAt)}
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">草稿</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {draftsData.length > 0 && (
            <button
              onClick={clearAllDrafts}
              className="mt-4 w-full flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" />
              清理所有草稿
            </button>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5" />
            <h3 className="text-lg font-semibold">已发布流程 ({publishedData.length})</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">当前存储的已发布流程</p>
          {publishedData.length === 0 ? (
            <p className="text-gray-500">暂无已发布流程</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {publishedData.map((flow, index) => (
                <div key={index} className="p-3 border border-gray-200 rounded-lg">
                  <div className="font-medium">ID: {flow.id}</div>
                  <div className="text-sm text-gray-600">
                    名称: {flow.name}
                  </div>
                  <div className="text-sm text-gray-600">
                    更新: {formatDate(flow.updatedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-lg font-semibold">LocalStorage 数据 ({localStorageData.length})</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">LocalStorage 中所有数据</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {localStorageData.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2 border border-gray-200 rounded">
                <div>
                  <div className="font-medium text-sm">{item.key}</div>
                  <div className="text-xs text-gray-600">
                    {formatSize(item.size)}
                  </div>
                </div>
                <button
                  onClick={() => clearKey(item.key)}
                  className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 草稿ID重命名 */}
      {selectedDraft && (
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">重命名草稿ID</h3>
          <p className="text-gray-600 mb-4">
            将草稿 ID "{selectedDraft}" 重命名为新ID
          </p>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium">新ID</label>
              <input
                type="text"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="输入新的草稿ID"
                className="w-full p-2 border border-gray-300 rounded-md mt-1"
              />
            </div>
            <button
              onClick={renameDraftId}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              重命名
            </button>
          </div>
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>注意：</strong>新ID不能与现有的草稿ID或已发布流程ID重复。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}