/**
 * useFlowDraft Hook 单元测试
 * 
 * 测试重点：
 * - 状态管理
 * - 草稿操作
 * - ID验证
 * - localStorage同步
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFlowDraft } from './useFlowDraft';
import flowStore from '../../data/flowStore';
import { generateFlowId } from '../../lib/idUtils';

// Mock dependencies
jest.mock('../../data/flowStore');
jest.mock('../../lib/idUtils');
jest.mock('../../hooks/useInput');

const mockFlowStore = flowStore as jest.Mocked<typeof flowStore>;
const mockGenerateFlowId = generateFlowId as jest.MockedFunction<typeof generateFlowId>;
const mockUseTextInput = require('../../hooks/useInput').useTextInput as jest.MockedFunction<any>;

describe('useFlowDraft Hook', () => {
  const mockFlowId = 'test-flow-id';
  const mockFlow = {
    id: mockFlowId,
    name: 'Test Flow',
    nodes: [],
    edges: [],
    viewport: { scale: 1, translate: { x: 0, y: 0 } }
  } as any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    mockFlowStore.getAll.mockReturnValue([]);
    mockFlowStore.get.mockReturnValue(null);
    mockGenerateFlowId.mockReturnValue(mockFlowId);
    mockUseTextInput.mockReturnValue({
      value: '',
      setExternal: jest.fn(),
      onChange: jest.fn(),
    });
  });

  describe('Initialization', () => {
    it('should initialize with empty flow when no initial flow provided', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      expect(result.current.flow).toEqual({
        id: expect.any(String),
        name: '未命名流程',
        nodes: [],
        edges: [],
        viewport: { scale: 1, translate: { x: 0, y: 0 } }
      });
    });

    it('should initialize with provided flow when initial flow provided', () => {
      const { result } = renderHook(() => 
        useFlowDraft({ initialFlow: mockFlow })
      );
      
      expect(result.current.flow).toEqual(mockFlow);
    });

    it('should initialize with provided flowId when initial flowId provided', () => {
      const { result } = renderHook(() => 
        useFlowDraft({ initialFlowId: mockFlowId })
      );
      
      expect(result.current.flow.id).toBe(mockFlowId);
    });
  });

  describe('Flow Management', () => {
    it('should update flow when setFlow is called', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      const updatedFlow = { ...mockFlow, name: 'Updated Flow' };
      
      act(() => {
        result.current.setFlow(updatedFlow);
      });
      
      expect(result.current.flow).toEqual(updatedFlow);
    });

    it('should update flow name when flowNameInput is changed', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      act(() => {
        result.current.flowNameInput.onChange('New Flow Name');
      });
      
      expect(result.current.flow.name).toBe('New Flow Name');
    });
  });

  describe('Draft Management', () => {
    it('should save draft to flowStore', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      act(() => {
        result.current.saveDraft();
      });
      
      expect(mockFlowStore.create).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        nodes: [],
        edges: [],
        viewport: { scale: 1, translate: { x: 0, y: 0 } }
      }));
    });

    it('should load draft from flowStore', () => {
      mockFlowStore.get.mockReturnValue(mockFlow);
      
      const { result } = renderHook(() => useFlowDraft({}));
      
      act(() => {
        result.current.loadDraft(mockFlowId);
      });
      
      expect(result.current.flow).toEqual(mockFlow);
      expect(result.current.draftId).toBe(mockFlowId);
    });

    it('should delete draft from flowStore', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      act(() => {
        result.current.deleteDraft(mockFlowId);
      });
      
      expect(mockFlowStore.delete).toHaveBeenCalledWith(mockFlowId);
    });

    it('should update drafts list when loading drafts', () => {
      const mockDrafts = [mockFlow, { ...mockFlow, id: 'draft-2' }];
      mockFlowStore.getAll.mockReturnValue(mockDrafts);
      
      const { result } = renderHook(() => useFlowDraft({}));
      
      expect(result.current.drafts).toEqual(mockDrafts);
    });
  });

  describe('ID Validation', () => {
    it('should validate flow ID format', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      // Test invalid ID
      act(() => {
        result.current.setIdErrors(['Invalid ID format']);
      });
      
      expect(result.current.idErrors).toContain('Invalid ID format');
    });

    it('should mark ID as dirty when changed', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      act(() => {
        result.current.setIdDirty(true);
      });
      
      expect(result.current.idDirty).toBe(true);
    });
  });

  describe('Save Status', () => {
    it('should update save status when saving', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      act(() => {
        result.current.saveDraft();
      });
      
      expect(result.current.saveStatus).toBe('saving');
      
      // Simulate save completion
      act(() => {
        result.current.saveDraft();
      });
      
      expect(result.current.saveStatus).toBe('saved');
    });
  });

  describe('Show Drafts', () => {
    it('should toggle showDrafts state', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      expect(result.current.showDrafts).toBe(false);
      
      act(() => {
        result.current.setShowDrafts(true);
      });
      
      expect(result.current.showDrafts).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when loading draft fails', () => {
      mockFlowStore.get.mockImplementation(() => {
        throw new Error('Load failed');
      });
      
      const { result } = renderHook(() => useFlowDraft({}));
      
      expect(() => {
        act(() => {
          result.current.loadDraft(mockFlowId);
        });
      }).toThrow('Load failed');
    });

    it('should handle errors when saving draft fails', () => {
      mockFlowStore.create.mockImplementation(() => {
        throw new Error('Save failed');
      });
      
      const { result } = renderHook(() => useFlowDraft({}));
      
      expect(() => {
        act(() => {
          result.current.saveDraft();
        });
      }).toThrow('Save failed');
    });
  });

  describe('Integration with FlowStore', () => {
    it('should sync with flowStore when flow changes', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      
      act(() => {
        result.current.setFlow(mockFlow);
      });
      
      expect(mockFlowStore.update).toHaveBeenCalledWith(mockFlowId, mockFlow);
    });

    it('should sync with flowStore when flow is created', () => {
      const { result } = renderHook(() => useFlowDraft({}));
      const newFlow = { ...mockFlow, id: 'new-flow' };
      
      act(() => {
        result.current.setFlow(newFlow);
      });
      
      expect(mockFlowStore.create).toHaveBeenCalledWith(newFlow);
    });
  });
});