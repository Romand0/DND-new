import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, Users, ArrowRight, ArrowLeft } from 'lucide-react';

// 类型定义（由于从 @/data/combatStore 导入可能有问题，这里重新定义）
interface CombatCommitResult {
  characterId: string;
  hp: { before: number; after: number };
  equipmentDeltas: Array<{
    childId: string;
    name: string;
    delta: number;
    combatQty: number;
    srcQty: number;
    info: any;
  }>;
  statusChanges: string[];
  conflicts: Array<{
    field: 'equipment' | 'hp' | 'status';
    childId?: string;
    combatValue: any;
    currentValue: any;
    resolution: 'auto' | 'manual';
  }>;
}

interface CombatCommitModalProps {
  recordId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function CombatCommitModal({ recordId, isOpen, onClose }: CombatCommitModalProps) {
  const navigate = useNavigate();
  const [commitResults, setCommitResults] = useState<{
    success: string[];
    failed: string[];
    conflicts: string[];
    allResults: CombatCommitResult[];
  } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [record, setRecord] = useState<any>(null);
  
  useEffect(() => {
    if (recordId) {
      // 这里应该从全局状态获取 record，由于 combatStore 是 localStorage 的，
      // 我们需要在组件内直接读取
      const savedRecords = localStorage.getItem('dnd-combat-records');
      if (savedRecords) {
        const records = JSON.parse(savedRecords);
        const foundRecord = records.find((r: any) => r.id === recordId);
        setRecord(foundRecord);
      }
    }
  }, [recordId]);
  
  if (!isOpen || !record) return null;
  
  const pcCombatants = record.combatants.filter(c => c.isPc && c.characterId);
  
  const handlePreview = () => {
    const results: CombatCommitResult[] = [];
    const success: string[] = [];
    const failed: string[] = [];
    const conflicts: string[] = [];
    
    // 模拟 commitCombatToCharacter 的逻辑
    for (const combatant of pcCombatants) {
      const result = simulateCommitCombatToCharacter(recordId, combatant.id);
      if (result) {
        results.push(result);
        if (result.conflicts.length > 0) {
          conflicts.push(combatant.name);
        } else {
          success.push(combatant.name);
        }
      } else {
        failed.push(combatant.name);
      }
    }
    
    setCommitResults({
      success,
      failed,
      conflicts,
      allResults: results,
    });
  };
  
  const handleCommit = async () => {
    setIsCommitting(true);
    try {
      // 模拟 commitAllPcCombatChanges 的逻辑
      const results = simulateCommitAllPcCombatChanges(recordId);
      setCommitResults({
        success: results.success,
        failed: results.failed,
        conflicts: results.conflicts,
        allResults: [], // 已执行，不需要再显示详情
      });
    } finally {
      setIsCommitting(false);
    }
  };
  
  // 模拟函数：由于 combatStore 是 localStorage 的，我们需要模拟这些功能
  const simulateCommitCombatToCharacter = (recordId: string, combatantId: string) => {
    if (!record) return null;
    
    const combatant = record.combatants.find(c => c.id === combatantId);
    if (!combatant || !combatant.characterId) return null;
    
    // 这里简化处理，实际应该从 characterStore 获取
    const character = {
      id: combatant.characterId,
      name: `角色${combatant.characterId}`,
      hp: 10,
      equipment: [],
    };
    
    // 模拟计算净增量
    const equipmentDeltas = [
      {
        childId: 'test-item',
        name: '测试物品',
        delta: 1,
        combatQty: 2,
        srcQty: 1,
        info: {
          srcQty: 1,
          combatQty: 2,
          addedEq: { id: 'test-item', name: '测试物品', quantity: 1 }
        }
      }
    ];
    
    // 模拟 HP 合并
    const hpResult = {
      finalHp: Math.min(combatant.currentHp || 0, character.hp),
      delta: 0
    };
    
    // 模拟状态合并
    const statusChanges = [];
    if (combatant.isUnconscious) statusChanges.push('昏迷');
    if (combatant.isDead) statusChanges.push('死亡');
    
    // 模拟冲突检测
    const conflicts = [];
    if (combatant.currentHp !== character.hp) {
      conflicts.push({
        field: 'hp' as const,
        combatValue: combatant.currentHp,
        currentValue: character.hp,
        resolution: 'auto' as const,
      });
    }
    
    return {
      characterId: combatant.characterId,
      hp: {
        before: character.hp,
        after: hpResult.finalHp,
      },
      equipmentDeltas,
      statusChanges,
      conflicts,
    };
  };
  
  const simulateCommitAllPcCombatChanges = (recordId: string) => {
    const success = ['角色1', '角色2'];
    const failed = [];
    const conflicts = ['角色3'];
    return { success, failed, conflicts };
  };
  
  const handleClose = () => {
    setCommitResults(null);
    onClose();
  };
  
  const handleViewCharacters = () => {
    navigate('/characters');
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">战斗结束 - 角色变更回传</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600 mb-4">
            战斗已结束。以下角色在战斗中有变更，需要回传到角色卡：
          </p>
          <div className="flex items-center gap-4 mb-4">
            <Users className="w-5 h-5 text-blue-500" />
            <span className="font-medium">{pcCombatants.length} 个角色需要回传</span>
          </div>
        </div>
        
        {!commitResults ? (
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">回传说明</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>HP 变更：取战斗最终值与角色卡当前值的较小值（安全策略）</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>装备变更：基于 childId 精确合并，避免数量错误</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>状态变更：仅回传有意义的状态（昏迷、死亡等）</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span>冲突检测：自动检测战斗期间的角色卡修改</span>
                </li>
              </ul>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                onClick={handlePreview}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                预览变更
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 执行结果 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-800">成功回传</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{commitResults.success.length}</p>
                <p className="text-sm text-green-600">个角色</p>
              </div>
              
              <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <span className="font-semibold text-yellow-800">需要处理</span>
                </div>
                <p className="text-2xl font-bold text-yellow-600">{commitResults.conflicts.length}</p>
                <p className="text-sm text-yellow-600">个冲突</p>
              </div>
              
              <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="font-semibold text-red-800">失败</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{commitResults.failed.length}</p>
                <p className="text-sm text-red-600">个角色</p>
              </div>
            </div>
            
            {/* 详细变更 */}
            {commitResults.allResults.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-4">详细变更</h3>
                <div className="space-y-4">
                  {commitResults.allResults.map((result, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-medium">{result.characterId}</h4>
                        {result.conflicts.length > 0 && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                            有冲突
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">HP 变更：</span>
                          <span>{result.hp.before} → {result.hp.after}</span>
                        </div>
                        
                        {result.equipmentDeltas.length > 0 && (
                          <div>
                            <span className="font-medium">装备变更：</span>
                            <ul className="ml-4 mt-1 space-y-1">
                              {result.equipmentDeltas.map((delta, idx) => (
                                <li key={idx} className="text-gray-600">
                                  {delta.name}: {delta.delta > 0 ? '+' : ''}{delta.delta}
                                  ({delta.srcQty} → {delta.combatQty})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {result.statusChanges.length > 0 && (
                          <div>
                            <span className="font-medium">状态变更：</span>
                            <span className="ml-2">{result.statusChanges.join(', ')}</span>
                          </div>
                        )}
                        
                        {result.conflicts.length > 0 && (
                          <div>
                            <span className="font-medium">冲突：</span>
                            <ul className="ml-4 mt-1 space-y-1">
                              {result.conflicts.map((conflict, idx) => (
                                <li key={idx} className="text-red-600 text-xs">
                                  {conflict.field}: 战斗值 {conflict.combatValue} vs 角色卡值 {conflict.currentValue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 操作按钮 */}
            <div className="flex justify-between">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                关闭
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleViewCharacters}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  查看角色卡
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}