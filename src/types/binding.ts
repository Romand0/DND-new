import type { Spell } from '@/types/spell';
import type { FlowDefinition } from '@/types/flow';

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
}

export interface BindingCreateData {
  spell_id: string;
  flow_id: string;
}

export interface SpellWithFlowBindings {
  id: string;
  name: string;
  level: number;
  school: string;
  data: any;
  boundFlows?: FlowDefinition[];
  bindingsCount?: number;
}

export interface FlowWithSpellBindings {
  id: string;
  name: string;
  category: string;
  data: any;
  publishedVersion?: number;
  publishedAt?: number;
  boundSpells?: Spell[];
  bindingsCount?: number;
}