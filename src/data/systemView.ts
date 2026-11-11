// 从选项库收集角色职业链上的玩法体系组（容器 + 全貌成员），供 FeatureSystemView 只读消费。
import type { Character, Feature, FeatureRole } from '@/types/character';
import type { OptionTrait } from '@/types/characterOption';
import { optionStore } from '@/data/optionStore';
import { getSubclassDisplayName } from '@/data/subclasses';

export interface SystemMember {
  name: string;
  optionName: string;
  description: string;
  level?: number;
  role?: FeatureRole;
  source: string;
  category: '职业特性';
  system: string;
  containerName: string;
  custom?: boolean;
}

export interface SystemGroup {
  system: string;
  containerName: string;
  containerText: string;
  source: string;
  level?: number;
  members: SystemMember[];
}

const PREFIX_CONTAINERS = new Set(['图腾精魄', '兽之形', '图腾同调', '战斗风格']);

export function memberCardName(containerName: string, optionName: string): string {
  if (PREFIX_CONTAINERS.has(containerName)) return `${containerName}：${optionName}`;
  return optionName;
}

function pushTrait(groups: SystemGroup[], t: OptionTrait, source: string) {
  if (t.systemKind === 'container' && t.system) {
    let g = groups.find((x) => x.system === t.system && x.containerName === t.name);
    if (!g) {
      g = {
        system: t.system,
        containerName: t.name,
        containerText: t.text,
        source,
        level: t.level,
        members: [],
      };
      groups.push(g);
    }
    for (const o of t.options || []) {
      const name = memberCardName(t.name, o.name);
      if (g.members.some((m) => m.name === name || m.optionName === o.name)) continue;
      g.members.push({
        name,
        optionName: o.name,
        description: o.text,
        level: o.level ?? t.level,
        role: o.role,
        source,
        category: '职业特性',
        system: t.system,
        containerName: t.name,
      });
    }
  }
  if (t.systemKind === 'member' && t.system) {
    let g = groups.find((x) => x.system === t.system);
    if (!g) {
      g = { system: t.system, containerName: t.system, containerText: '', source, members: [] };
      groups.push(g);
    }
    if (!g.members.some((m) => m.name === t.name || m.optionName === t.name)) {
      g.members.push({
        name: t.name,
        optionName: t.name,
        description: t.text,
        level: t.level,
        role: t.role,
        source,
        category: '职业特性',
        system: t.system,
        containerName: g.containerName,
      });
    }
  }
}

/** 收集角色职业/子职业链上的体系组；卡上手录成员并入同体系 */
export function collectSystemGroups(character: {
  race?: string;
  background?: string;
  profession?: { class?: string; subclass?: string };
  features?: Feature[];
}): SystemGroup[] {
  const groups: SystemGroup[] = [];
  const className = character.profession?.class;
  if (className) {
    const cls = optionStore.getByName(className, 'class');
    if (cls) for (const t of cls.traits || []) pushTrait(groups, t, cls.name);
  }
  const subclassName = character.profession?.subclass;
  if (subclassName) {
    const displayName = getSubclassDisplayName(character as Character);
    const sub =
      optionStore.getByName(displayName || subclassName, 'subclass') ??
      optionStore.getByName(subclassName, 'subclass');
    if (sub) for (const t of sub.traits || []) pushTrait(groups, t, sub.name);
  }
  for (const f of character.features || []) {
    if (f.systemKind !== 'member' || !f.system) continue;
    let g = groups.find((x) => x.system === f.system);
    if (!g) {
      g = {
        system: f.system,
        containerName: f.system,
        containerText: '',
        source: f.source || '',
        members: [],
      };
      groups.push(g);
    }
    if (g.members.some((m) => m.name === f.name || m.optionName === f.name)) continue;
    g.members.push({
      name: f.name,
      optionName: f.name,
      description: f.description,
      level: f.level,
      role: f.role,
      source: f.source || g.source,
      category: '职业特性',
      system: f.system,
      containerName: g.containerName,
      custom: true,
    });
  }
  for (const g of groups) {
    g.members.sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name, 'zh'));
  }
  return groups;
}

export function isMemberSelected(features: Feature[] | undefined, member: SystemMember): boolean {
  return (features || []).some((f) => f.name === member.name || f.name === member.optionName);
}
