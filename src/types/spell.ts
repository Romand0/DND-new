export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
  };
  duration: string;
  description: string;
  classes: string[];
  notes?: string;
  ritual?: boolean;         // 是否为仪式法术
  concentration?: boolean;  // 是否需要专注
  source?: string;          // 来源书，如 "PHB"、"TCE"
  hasHeightened?: boolean;
  heightenedEffect?: string;
  materialInfo?: string;
}
