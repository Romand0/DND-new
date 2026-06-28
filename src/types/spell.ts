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
}
