import { useCallback } from 'react';
import { Equipment } from '@/types/character';
import { extractBaseFields } from '@/data/equipmentFactory';
import { characterStore } from '@/data/characterStore';
import * as api from '@/lib/api';

export function useEquipmentActions(charId: string | undefined, refresh: () => void) {
  
  const handleAddEquipmentFromLibrary = useCallback((item: any) => {
  if (!charId) return null;
  const tempEquipment: Equipment & { id: string; templateId?: string } = {
    id: `temp-${Date.now()}`,
    templateId: item.id,
    quantity: undefined,
    packSize: item.packSize,
    unit: item.unit,
    ...extractBaseFields(item),
  };
  return tempEquipment;
}, [charId]);


  const handleSaveEquipment = useCallback(async (
    editingEquipment: (Equipment & { id: string }) | null,
    formData: any,
    syncToLibrary?: boolean,
    onSuccess?: () => void,
  ) => {
    if (!charId) return;

    if (syncToLibrary) {
      const libraryItem: any = {
        id: formData.id,
        ...extractBaseFields(formData),
        isCustom: false,
      };
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      try {
        await api.apiFetch(`/equipments/${formData.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(libraryItem),
        });
      } catch {
        const finalId = formData.id.startsWith('temp-')
          ? formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
          : formData.id;
        await api.apiFetch('/equipments', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...libraryItem, id: finalId }),
        });
      }
    }

    if (!editingEquipment) {
      characterStore.addEquipment(charId, {
        quantity: formData.quantity || 1,
        ...extractBaseFields(formData),
      });
    } else if (editingEquipment.id.startsWith('temp-')) {
      const templateId = (editingEquipment as any).templateId || '';
      const finalId = formData.id.startsWith('temp-') ? (templateId || undefined) : formData.id;
      characterStore.addEquipment(charId, {
        id: finalId,
        quantity: formData.quantity || 1,
        ...extractBaseFields({ ...formData, id: finalId }),
      });
    } else {
  const equipId = (editingEquipment as any).childId || editingEquipment.id;
  characterStore.updateEquipment(charId, equipId, {
    id: formData.id || editingEquipment.id,  // 保留用户修改的ID
    quantity: formData.quantity,
    ...extractBaseFields(formData),
  });
}


    refresh();
    onSuccess?.();
  }, [charId, refresh]);

  const handleDeleteEquipment = useCallback((deleteConfirmId: string | null) => {
    if (!charId || !deleteConfirmId) return;
    characterStore.deleteEquipment(charId, deleteConfirmId);
    refresh();
  }, [charId, refresh]);

  const handleUpdateEquipmentQuantity = useCallback((equipId: string, delta: number) => {
    if (!charId) return;
    const char = characterStore.get(charId);
    if (!char) return;
    const equip = char.equipment.find((e) => (e.childId || e.id) === equipId);
    if (!equip) return;
    const newQty = Math.max(1, (equip.quantity || 1) + delta);
    characterStore.updateEquipment(charId, equipId, { quantity: newQty });
    refresh();
  }, [charId, refresh]);

  return {
    handleAddEquipmentFromLibrary,
    handleSaveEquipment,
    handleDeleteEquipment,
    handleUpdateEquipmentQuantity,
  };
}
