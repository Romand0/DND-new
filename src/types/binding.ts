import type { Spell } from '@/types/spell';
import type { FlowDefinition, FlowCategory } from '@/types/flow';

export interface SpellFlowBinding {
  id: string;
  spell_id: string;
  flow_id: string;
  created_at: number;
  updated_at: number;
}

export interface SpellWithBindings extends Spell {
  boundFlows?: FlowDefinition[];
  bindingsCount?: number;
}

export interface FlowWithBindings extends FlowDefinition {
  boundSpells?: Spell[];
  bindingsCount?: number;
  category?: FlowCategory;
  data?: any;
}

export interface BindingCreateData {
  spell_id: string;
  flow_id: string;
}

export interface SpellWithFlowBindings extends Spell {
  boundFlows?: FlowDefinition[];
  bindingsCount?: number;
}

export interface FlowWithSpellBindings extends FlowDefinition {
  boundSpells?: Spell[];
  bindingsCount?: number;
  category?: FlowCategory;
  data?: any;
}